/**
 * Minimal ZIP reader/splicer for in-place DOCX editing.
 *
 * JSZip cannot round-trip a real .docx byte-for-byte: it re-emits its own local
 * headers (dropping data descriptors, extra fields and STORE entries), so a
 * load→save with nothing changed already differs from the input. This module
 * indexes the source archive and, on write, copies every untouched entry's
 * local region verbatim, re-deflating only the parts that were marked dirty.
 */

import { deflateRawSync, crc32 } from "zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_DESCRIPTOR = 0x08074b50;
const U32_MAX = 0xffffffff;

export interface ZipEntry {
  name: string;
  /** Byte range of the local header + data (+ data descriptor) in the source. */
  localOffset: number;
  localEnd: number;
  /** Byte range of the central directory record in the source. */
  centralOffset: number;
  centralEnd: number;
  dataOffset: number;
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  crc: number;
  dosTime: number;
  dosDate: number;
}

export interface ZipIndex {
  entries: ZipEntry[];
  /** Indices into `entries`, sorted by physical position in the archive. */
  physicalOrder: number[];
  comment: Buffer;
}

function findEocd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error("zip: end of central directory not found");
}

function readCentralRecord(buf: Buffer, off: number): { entry: ZipEntry; next: number } {
  if (buf.readUInt32LE(off) !== SIG_CENTRAL) throw new Error("zip: bad central record");
  const flags = buf.readUInt16LE(off + 8);
  const nameLen = buf.readUInt16LE(off + 28);
  const extraLen = buf.readUInt16LE(off + 30);
  const commentLen = buf.readUInt16LE(off + 32);
  const localOffset = buf.readUInt32LE(off + 42);
  const compressedSize = buf.readUInt32LE(off + 20);
  const uncompressedSize = buf.readUInt32LE(off + 24);
  if (localOffset === U32_MAX || compressedSize === U32_MAX || uncompressedSize === U32_MAX) {
    throw new Error("zip: zip64 archives are not supported");
  }
  const entry: ZipEntry = {
    name: buf.subarray(off + 46, off + 46 + nameLen).toString("utf8"),
    localOffset,
    localEnd: 0,
    centralOffset: off,
    centralEnd: off + 46 + nameLen + extraLen + commentLen,
    dataOffset: 0,
    method: buf.readUInt16LE(off + 10),
    flags,
    compressedSize,
    uncompressedSize,
    crc: buf.readUInt32LE(off + 16),
    dosTime: buf.readUInt16LE(off + 12),
    dosDate: buf.readUInt16LE(off + 14),
  };
  return { entry, next: entry.centralEnd };
}

/** Fills in dataOffset/localEnd by reading the entry's local header. */
function resolveLocal(buf: Buffer, e: ZipEntry): void {
  const off = e.localOffset;
  if (buf.readUInt32LE(off) !== SIG_LOCAL) throw new Error(`zip: bad local header for ${e.name}`);
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  e.dataOffset = off + 30 + nameLen + extraLen;
  let end = e.dataOffset + e.compressedSize;
  if (e.flags & 0x08) {
    end += buf.length >= end + 4 && buf.readUInt32LE(end) === SIG_DESCRIPTOR ? 16 : 12;
  }
  e.localEnd = end;
}

export function readZipIndex(buf: Buffer): ZipIndex {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const commentLen = buf.readUInt16LE(eocd + 20);
  if (count === 0xffff) throw new Error("zip: zip64 archives are not supported");
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    const { entry, next } = readCentralRecord(buf, off);
    resolveLocal(buf, entry);
    entries.push(entry);
    off = next;
  }
  // `entries` keeps central-directory order; physicalOrder is the write order.
  const physicalOrder = entries
    .map((_, i) => i)
    .sort((a, b) => entries[a].localOffset - entries[b].localOffset);
  return { entries, physicalOrder, comment: buf.subarray(eocd + 22, eocd + 22 + commentLen) };
}

function buildLocal(e: ZipEntry, payload: Buffer): Buffer {
  const name = Buffer.from(e.name, "utf8");
  const head = Buffer.alloc(30);
  head.writeUInt32LE(SIG_LOCAL, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(e.flags, 6);
  head.writeUInt16LE(e.method, 8);
  head.writeUInt16LE(e.dosTime, 10);
  head.writeUInt16LE(e.dosDate, 12);
  head.writeUInt32LE(e.crc, 14);
  head.writeUInt32LE(e.compressedSize, 18);
  head.writeUInt32LE(e.uncompressedSize, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  return Buffer.concat([head, name, payload]);
}

function buildCentral(src: Buffer, e: ZipEntry, offset: number, rebuilt: boolean): Buffer {
  if (!rebuilt) {
    const rec = Buffer.from(src.subarray(e.centralOffset, e.centralEnd));
    rec.writeUInt32LE(offset, 42);
    return rec;
  }
  const name = Buffer.from(e.name, "utf8");
  const rec = Buffer.alloc(46);
  rec.writeUInt32LE(SIG_CENTRAL, 0);
  rec.writeUInt16LE(src.readUInt16LE(e.centralOffset + 4), 4);
  rec.writeUInt16LE(20, 6);
  rec.writeUInt16LE(e.flags, 8);
  rec.writeUInt16LE(e.method, 10);
  rec.writeUInt16LE(e.dosTime, 12);
  rec.writeUInt16LE(e.dosDate, 14);
  rec.writeUInt32LE(e.crc, 16);
  rec.writeUInt32LE(e.compressedSize, 20);
  rec.writeUInt32LE(e.uncompressedSize, 24);
  rec.writeUInt16LE(name.length, 28);
  rec.writeUInt16LE(src.readUInt16LE(e.centralOffset + 36), 36);
  rec.writeUInt32LE(src.readUInt32LE(e.centralOffset + 38), 38);
  rec.writeUInt32LE(offset, 42);
  return Buffer.concat([rec, name]);
}

function replaceEntry(e: ZipEntry, content: Buffer): { entry: ZipEntry; payload: Buffer } {
  const payload = deflateRawSync(content, { level: 9 });
  const entry: ZipEntry = {
    ...e,
    flags: e.flags & ~0x08,
    method: 8,
    crc: crc32(content) >>> 0,
    compressedSize: payload.length,
    uncompressedSize: content.length,
  };
  return { entry, payload };
}

/**
 * Rebuilds the archive: entries named in `replacements` are re-deflated, every
 * other entry's local region is copied byte-for-byte from `src`.
 */
export function writeZip(src: Buffer, index: ZipIndex, replacements: Map<string, Buffer>): Buffer {
  const chunks: Buffer[] = [];
  const placed = new Map<number, { offset: number; entry: ZipEntry; rebuilt: boolean }>();
  let cursor = 0;
  for (const i of index.physicalOrder) {
    const e = index.entries[i];
    const content = replacements.get(e.name);
    let block: Buffer;
    let entry = e;
    let rebuilt = false;
    if (content) {
      const r = replaceEntry(e, content);
      entry = r.entry;
      rebuilt = true;
      block = buildLocal(entry, r.payload);
    } else {
      block = src.subarray(e.localOffset, e.localEnd);
    }
    placed.set(i, { offset: cursor, entry, rebuilt });
    chunks.push(block);
    cursor += block.length;
  }
  const cdStart = cursor;
  for (let i = 0; i < index.entries.length; i++) {
    const p = placed.get(i)!;
    const rec = buildCentral(src, p.entry, p.offset, p.rebuilt);
    chunks.push(rec);
    cursor += rec.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(index.entries.length, 8);
  eocd.writeUInt16LE(index.entries.length, 10);
  eocd.writeUInt32LE(cursor - cdStart, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(index.comment.length, 20);
  chunks.push(eocd, index.comment);
  return Buffer.concat(chunks);
}

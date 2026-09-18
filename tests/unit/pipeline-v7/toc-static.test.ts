/**
 * Статическое заполнение поля TOC: сборка XML при подменённом рендере.
 *
 * Фикстура собирается вручную через buildMiniDocx, а абзац поля повторяет то,
 * что реально эмитит aux/toc.ts (fldChar begin(dirty) → instrText → separate →
 * пустой w:t → end, обёрнутый закладкой `_dpx_aux_toc_2`) — так тест не тянет
 * весь оркестратор ради трёх заголовков.
 */

import { describe, it, expect, beforeEach } from "vitest";
import JSZip from "jszip";
import { fillTocStatic, resetSofficeCache } from "@/lib/pipeline-v7/aux/toc-static";
import { buildMiniDocx, p } from "./helpers/mini-docx";

const RPR = '<w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="28"/></w:rPr>';

const FIELD_P =
  `<w:p><w:bookmarkStart w:id="2" w:name="_dpx_aux_toc_2"/>` +
  `<w:r>${RPR}<w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
  `<w:r>${RPR}<w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>` +
  `<w:r>${RPR}<w:fldChar w:fldCharType="separate"/></w:r>` +
  `<w:r>${RPR}<w:t xml:space="preserve"/></w:r>` +
  `<w:r>${RPR}<w:fldChar w:fldCharType="end"/></w:r>` +
  `<w:bookmarkEnd w:id="2"/></w:p>`;

const SECT_PR =
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1134" w:right="567" w:bottom="1134" w:left="1701"/></w:sectPr>`;

const heading = (level: number, text: string) =>
  p(text, `<w:pStyle w:val="DpxHeading${level}"/>`);

function fixture(): Promise<Buffer> {
  return buildMiniDocx({
    body:
      p("Титульный лист", '<w:pStyle w:val="DpxBody"/>') +
      p("СОДЕРЖАНИЕ", '<w:pStyle w:val="DpxTocTitle"/>') +
      FIELD_P +
      heading(1, "ВВЕДЕНИЕ") +
      heading(1, "1 ОБЗОР") +
      heading(2, "1.1 Постановка задачи") +
      SECT_PR,
    styles: '<w:style w:type="paragraph" w:styleId="DpxBody"><w:name w:val="Body"/></w:style>',
  });
}

/** Три страницы: титул, содержание, затем тело — как в реальном рендере. */
const PAGES = ["титул", "СОДЕРЖАНИЕ", "ВВЕДЕНИЕ текст", "1 ОБЗОР текст\n1.1 Постановка задачи"];

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file("word/document.xml")!.async("string");
}

describe("fillTocStatic", () => {
  beforeEach(() => resetSofficeCache());

  it("собирает поле с тремя строками, табами и номерами страниц", async () => {
    const docx = await fixture();
    const result = await fillTocStatic(docx, {
      hasTools: () => true,
      renderPages: () => PAGES,
    });

    expect(result.skipped).toBeUndefined();
    expect(result.filled).toBe(3);

    const xml = await documentXml(result.output);
    expect(xml).toContain('<w:fldChar w:fldCharType="begin" w:dirty="true"/>');
    expect(xml).toContain('<w:fldChar w:fldCharType="end"/>');
    expect(xml).toContain('<w:tab w:val="right" w:leader="dot" w:pos="9638"/>');

    const entries = (xml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*?<w:tab\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g) ?? []);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toContain("ВВЕДЕНИЕ");
    expect(entries[0]).toContain("<w:t>3</w:t>");
    expect(entries[0]).toContain('w:name="_dpx_aux_toc_2"');
    expect(entries[0]).toContain('<w:fldChar w:fldCharType="separate"/>');
    expect(entries[1]).toContain("<w:t>4</w:t>");
    expect(entries[2]).toContain('<w:ind w:left="220" w:firstLine="0"/>');
    expect(entries[2]).toContain("<w:t>4</w:t>");

    // Закладка открыта в первом абзаце и закрыта в последнем.
    expect(entries[0]).not.toContain("<w:bookmarkEnd");
    expect(entries[2]).toContain('<w:bookmarkEnd w:id="2"/>');
    // Стилей TOC1..3 в фикстуре нет — откат на DpxBody.
    expect(xml).not.toContain('w:pStyle w:val="TOC');
  });

  it("без soffice возвращает буфер побайтно", async () => {
    const docx = await fixture();
    const result = await fillTocStatic(docx, { hasTools: () => false, renderPages: () => PAGES });

    expect(result).toMatchObject({ filled: 0, skipped: "no-soffice" });
    expect(result.output.equals(docx)).toBe(true);
  });

  it("ненайденный заголовок получает «—»", async () => {
    const docx = await fixture();
    const result = await fillTocStatic(docx, {
      hasTools: () => true,
      renderPages: () => ["титул", "СОДЕРЖАНИЕ", "ВВЕДЕНИЕ текст", "прочее"],
    });

    expect(result.filled).toBe(1);
    const xml = await documentXml(result.output);
    expect(xml.match(/<w:t>—<\/w:t>/g)).toHaveLength(2);
  });

  it("без поля TOC документ не трогается", async () => {
    const docx = await buildMiniDocx({ body: heading(1, "ВВЕДЕНИЕ") + SECT_PR });
    const result = await fillTocStatic(docx, { hasTools: () => true, renderPages: () => PAGES });

    expect(result).toMatchObject({ filled: 0, skipped: "no-toc-field" });
    expect(result.output.equals(docx)).toBe(true);
  });
});

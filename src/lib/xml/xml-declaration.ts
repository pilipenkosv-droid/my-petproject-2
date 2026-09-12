/**
 * Узел XML-декларации (`<?xml ... ?>`) в ordered-формате fast-xml-parser.
 *
 * Живёт отдельно от docx-xml.ts, потому что тот файл уже превышает лимит в 300 строк.
 */

import type { OrderedXmlNode } from "./docx-xml";

/**
 * Создаёт узел `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`.
 *
 * ВАЖНО: XMLBuilder сериализует processing instruction как
 * `node[tag][0]["#text"]`, поэтому у узла ОБЯЗАН быть текстовый потомок.
 * Узел с пустым массивом потомков (`{ "?xml": [] }`) роняет build()
 * с `Cannot read properties of undefined (reading '#text')`.
 * Именно такую форму отдаёт парсер при чтении реального документа.
 */
export function createXmlDeclNode(): OrderedXmlNode {
  return {
    "?xml": [{ "#text": "" }],
    ":@": { "@_version": "1.0", "@_encoding": "UTF-8", "@_standalone": "yes" },
  } as OrderedXmlNode;
}

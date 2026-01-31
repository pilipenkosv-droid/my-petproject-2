/**
 * Утилиты для парсинга/сериализации OOXML с сохранением порядка элементов.
 *
 * Использует fast-xml-parser с preserveOrder: true.
 * Это гарантирует что смешанные дочерние элементы (w:p, w:tbl и т.д.)
 * сохраняют свою позицию при roundtrip parse→build.
 */

import { XMLParser, XMLBuilder } from "fast-xml-parser";

// Тип узла в ordered-формате fast-xml-parser:
// { "tagName": [...children], ":@": { "@_attr": "value" } }
// Текстовый узел: { "#text": "content" }
export interface OrderedXmlNode {
  [key: string]: any;
}

const PARSER_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false,
  parseTagValue: false,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
  processEntities: false,
  htmlEntities: false,
} as const;

const BUILDER_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: false,
  suppressEmptyNode: true,
  processEntities: false,
} as const;

/**
 * Парсит OOXML-строку с сохранением порядка элементов
 */
export function parseDocxXml(xml: string): OrderedXmlNode[] {
  const parser = new XMLParser(PARSER_OPTIONS);
  return parser.parse(xml);
}

/**
 * Сериализует ordered-формат обратно в XML-строку
 */
export function buildDocxXml(nodes: OrderedXmlNode[]): string {
  const builder = new XMLBuilder(BUILDER_OPTIONS);
  const result = builder.build(nodes);
  // Если парсер сохранил <?xml?> как узел, builder восстановит его автоматически.
  // Добавляем декларацию только если её нет в результате.
  if (result.startsWith("<?xml")) {
    return result;
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + result;
}

// --- Навигационные утилиты ---

/**
 * Имя тега для ordered-узла (первый ключ, не ":@")
 */
export function tagName(node: OrderedXmlNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ":@" && key !== "#text" && key !== "#comment" && key !== "#cdata") {
      return key;
    }
  }
  return undefined;
}

/**
 * Дочерние элементы ordered-узла
 */
export function children(node: OrderedXmlNode): OrderedXmlNode[] {
  const tag = tagName(node);
  if (!tag) return [];
  return (node[tag] as OrderedXmlNode[]) || [];
}

/**
 * Устанавливает дочерние элементы ordered-узла
 */
export function setChildren(node: OrderedXmlNode, tag: string, newChildren: OrderedXmlNode[]): void {
  (node as any)[tag] = newChildren;
}

/**
 * Атрибуты ordered-узла (без префикса @_)
 */
export function getAttr(node: OrderedXmlNode, attrName: string): string | undefined {
  return node[":@"]?.[`@_${attrName}`] as string | undefined;
}

/**
 * Устанавливает атрибут на ordered-узле
 */
export function setAttr(node: OrderedXmlNode, attrName: string, value: string): void {
  if (!node[":@"]) {
    node[":@"] = {};
  }
  node[":@"]![`@_${attrName}`] = value;
}

/**
 * Удаляет атрибут из ordered-узла
 */
export function removeAttr(node: OrderedXmlNode, attrName: string): void {
  if (node[":@"]) {
    delete node[":@"]![`@_${attrName}`];
  }
}

/**
 * Все атрибуты узла как Record (без префикса @_)
 */
export function getAttrs(node: OrderedXmlNode): Record<string, string> {
  const raw = node[":@"];
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (key.startsWith("@_")) {
      result[key.slice(2)] = val as string;
    }
  }
  return result;
}

/**
 * Устанавливает все атрибуты (с добавлением префикса @_)
 */
export function setAttrs(node: OrderedXmlNode, attrs: Record<string, string>): void {
  const raw: Record<string, string> = {};
  for (const [key, val] of Object.entries(attrs)) {
    raw[`@_${key}`] = val;
  }
  node[":@"] = raw;
}

/**
 * Находит все прямые дочерние элементы с заданным тегом
 */
export function findChildren(node: OrderedXmlNode, childTag: string): OrderedXmlNode[] {
  const ch = children(node);
  return ch.filter((c) => childTag in c);
}

/**
 * Находит первый прямой дочерний элемент с заданным тегом
 */
export function findChild(node: OrderedXmlNode, childTag: string): OrderedXmlNode | undefined {
  return children(node).find((c) => childTag in c);
}

/**
 * Текстовое содержимое узла (ищет #text среди children)
 */
export function getText(node: OrderedXmlNode): string {
  const ch = children(node);
  const textNode = ch.find((c) => "#text" in c);
  return (textNode?.["#text"] as string) || "";
}

/**
 * Устанавливает текстовое содержимое (заменяет или создаёт #text)
 */
export function setText(node: OrderedXmlNode, text: string): void {
  const tag = tagName(node);
  if (!tag) return;
  const ch = children(node);
  const idx = ch.findIndex((c) => "#text" in c);
  if (idx >= 0) {
    ch[idx] = { "#text": text } as any;
  } else {
    ch.push({ "#text": text } as any);
  }
}

/**
 * Создаёт новый ordered-узел
 */
export function createNode(
  tag: string,
  attrs?: Record<string, string>,
  nodeChildren?: OrderedXmlNode[]
): OrderedXmlNode {
  const node: OrderedXmlNode = {
    [tag]: nodeChildren || [],
  };
  if (attrs && Object.keys(attrs).length > 0) {
    node[":@"] = {};
    for (const [key, val] of Object.entries(attrs)) {
      node[":@"]![`@_${key}`] = val;
    }
  }
  return node;
}

/**
 * Создаёт текстовый узел
 */
export function createTextNode(text: string): OrderedXmlNode {
  return { "#text": text } as any;
}

/**
 * Удаляет дочерний элемент с заданным тегом (первый найденный)
 */
export function removeChild(node: OrderedXmlNode, childTag: string): void {
  const tag = tagName(node);
  if (!tag) return;
  const ch = children(node);
  const idx = ch.findIndex((c) => childTag in c);
  if (idx >= 0) {
    ch.splice(idx, 1);
  }
}

/**
 * Вставляет или заменяет дочерний элемент с заданным тегом.
 * Если элемент уже есть — заменяет первый найденный.
 * Если нет — добавляет в начало (для pPr, rPr) или в конец.
 */
export function upsertChild(
  node: OrderedXmlNode,
  childNode: OrderedXmlNode,
  position: "start" | "end" = "end"
): void {
  const tag = tagName(node);
  if (!tag) return;
  const childTagName = tagName(childNode);
  if (!childTagName) return;

  const ch = children(node);
  const idx = ch.findIndex((c) => childTagName in c);
  if (idx >= 0) {
    ch[idx] = childNode;
  } else if (position === "start") {
    ch.unshift(childNode);
  } else {
    ch.push(childNode);
  }
}

// --- Высокоуровневые OOXML утилиты ---

/**
 * Получает w:body из распарсенного document.xml
 */
export function getBody(parsed: OrderedXmlNode[]): OrderedXmlNode | undefined {
  const doc = parsed.find((n) => "w:document" in n);
  if (!doc) return undefined;
  const docChildren = children(doc);
  return docChildren.find((n) => "w:body" in n);
}

/**
 * Дочерние элементы body (w:p, w:tbl, w:sectPr — в правильном порядке)
 */
export function getBodyChildren(body: OrderedXmlNode): OrderedXmlNode[] {
  return children(body);
}

/**
 * Получает все w:p из body (сохраняя правильный порядок)
 * Возвращает массив { node, bodyIndex, paragraphIndex }
 */
export function getParagraphsWithPositions(body: OrderedXmlNode): {
  node: OrderedXmlNode;
  bodyIndex: number;
  paragraphIndex: number;
}[] {
  const bodyChildren = children(body);
  const result: { node: OrderedXmlNode; bodyIndex: number; paragraphIndex: number }[] = [];
  let pIdx = 0;

  for (let i = 0; i < bodyChildren.length; i++) {
    if ("w:p" in bodyChildren[i]) {
      result.push({
        node: bodyChildren[i],
        bodyIndex: i,
        paragraphIndex: pIdx,
      });
      pIdx++;
    }
  }

  return result;
}

/**
 * Получает w:sectPr из body
 */
export function getSectPr(body: OrderedXmlNode): OrderedXmlNode | undefined {
  const bodyChildren = children(body);
  return bodyChildren.find((n) => "w:sectPr" in n);
}

/**
 * Устанавливает или создаёт свойство внутри XML-элемента (ordered-формат).
 * Аналог setXmlProp из xml2js формата.
 *
 * Пример: setOrderedProp(pPr, "w:jc", { "w:val": "center" })
 * Создаёт/обновляет <w:jc w:val="center"/> внутри pPr
 */
export function setOrderedProp(
  parentNode: OrderedXmlNode,
  propTag: string,
  attrs: Record<string, string>
): void {
  const ch = children(parentNode);
  const existing = ch.find((c) => propTag in c);

  if (existing) {
    // Мержим атрибуты
    if (!existing[":@"]) {
      existing[":@"] = {};
    }
    for (const [key, val] of Object.entries(attrs)) {
      existing[":@"]![`@_${key}`] = val;
    }
  } else {
    ch.push(createNode(propTag, attrs));
  }
}

/**
 * Удаляет свойство из XML-элемента (ordered-формат)
 */
export function removeOrderedProp(parentNode: OrderedXmlNode, propTag: string): void {
  removeChild(parentNode, propTag);
}

/**
 * Получает w:pPr из параграфа, создаёт если нет
 */
export function ensurePPr(paragraphNode: OrderedXmlNode): OrderedXmlNode {
  const ch = children(paragraphNode);
  let pPr = ch.find((c) => "w:pPr" in c);
  if (!pPr) {
    pPr = createNode("w:pPr");
    ch.unshift(pPr); // pPr всегда первый дочерний элемент
  }
  return pPr;
}

/**
 * Получает w:rPr из run, создаёт если нет
 */
export function ensureRPr(runNode: OrderedXmlNode): OrderedXmlNode {
  const ch = children(runNode);
  let rPr = ch.find((c) => "w:rPr" in c);
  if (!rPr) {
    rPr = createNode("w:rPr");
    ch.unshift(rPr); // rPr всегда первый дочерний элемент run
  }
  return rPr;
}

/**
 * Получает все w:r (runs) из параграфа
 */
export function getRuns(paragraphNode: OrderedXmlNode): OrderedXmlNode[] {
  return findChildren(paragraphNode, "w:r");
}

/**
 * Получает текст из w:t элемента run
 */
export function getRunText(runNode: OrderedXmlNode): string {
  const tNodes = findChildren(runNode, "w:t");
  return tNodes.map((t) => getText(t)).join("");
}

/**
 * Устанавливает текст в run (один w:t с xml:space="preserve")
 */
export function setRunText(runNode: OrderedXmlNode, text: string): void {
  const ch = children(runNode);
  // Удаляем все существующие w:t
  for (let i = ch.length - 1; i >= 0; i--) {
    if ("w:t" in ch[i]) {
      ch.splice(i, 1);
    }
  }
  // Добавляем новый w:t
  const tNode = createNode("w:t", { "xml:space": "preserve" });
  (tNode["w:t"] as OrderedXmlNode[]).push(createTextNode(text));
  ch.push(tNode);
}

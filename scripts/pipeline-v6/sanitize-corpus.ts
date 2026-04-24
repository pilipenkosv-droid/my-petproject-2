// Санитайзер golden-корпуса: убирает ПДн и чужой копирайт из реальных юзерских
// docx, чтобы бенч-пайплайн v6 не триггерил классификаторы и не хранил
// идентифицируемые данные в репозитории.
//
// Шаги:
//   1. Заменить блок титульника (по той же эвристике, что audit-titlepages.ts)
//      на канонический шаблон (ФИО/вуз/группа — плейсхолдеры).
//   2. Для остальных блоков — применить выбранный режим к тексту внутри <w:t>:
//        lorem — полностью заменить рус-текстом из словаря (структура/длины
//                 сохраняются, ПДн и копирайт исчезают). Дефолт для бенча.
//        mask  — маскировать email/телефоны/паспорт/ИНН/СНИЛС/ФИО-тройки.
//        keep  — не трогать текст (только титульник и метаданные).
//   3. Почистить docProps/core.xml и docProps/app.xml (author, company и т.п.).
//   4. Записать результат в data/golden/sanitized/{id}.docx и собрать
//      manifest.sanitized.json без source_document_id.
//
// Запуск:
//   npx tsx scripts/pipeline-v6/sanitize-corpus.ts [--mode=lorem|mask|keep] [--only=<id>]
//   по умолчанию: --mode=lorem, вся data/golden/raw -> data/golden/sanitized

import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";

type Mode = "lorem" | "mask" | "keep";

const HEADING_STYLES = new Set(["Heading1", "Heading2", "Heading3", "Title", "Subtitle", "1", "2"]);
const SECTION_TEXT = /^(Введение|ВВЕДЕНИЕ|Оглавление|ОГЛАВЛЕНИЕ|Содержание|СОДЕРЖАНИЕ|Глава\s+\d|ГЛАВА\s+\d|\d+(\.\d+)*\s+[А-Яа-я])/;

// Слова и паттерны, которые нельзя трогать — checker/structure-analyzer по ним
// детектят разделы, подписи, библиографию. Без whitelist бенч-скор на
// санитизированном корпусе несопоставим с raw (false negatives на structure rules).
const PRESERVE_WORDS = new Set([
  // Разделы ГОСТ
  "Введение", "ВВЕДЕНИЕ",
  "Заключение", "ЗАКЛЮЧЕНИЕ",
  "Оглавление", "ОГЛАВЛЕНИЕ",
  "Содержание", "СОДЕРЖАНИЕ",
  "Реферат", "РЕФЕРАТ",
  "Аннотация", "АННОТАЦИЯ",
  "Глава", "ГЛАВА",
  "Приложение", "ПРИЛОЖЕНИЕ",
  "Список", "СПИСОК",
  "литературы", "ЛИТЕРАТУРЫ",
  "источников", "ИСТОЧНИКОВ",
  "использованных", "ИСПОЛЬЗОВАННЫХ",
  "Библиографический", "БИБЛИОГРАФИЧЕСКИЙ",
  "Рисунок", "РИСУНОК", "Рис",
  "Таблица", "ТАБЛИЦА", "Табл",
  "Формула", "ФОРМУЛА",
]);

const LOREM_WORDS = [
  "образец", "текст", "пример", "материал", "раздел", "данные", "описание",
  "задача", "метод", "подход", "результат", "анализ", "обзор", "процесс",
  "этап", "структура", "схема", "параметр", "значение", "таблица", "рисунок",
  "формула", "условие", "требование", "качество", "показатель", "сравнение",
  "вывод", "решение", "модель", "система", "элемент", "компонент", "функция",
];

function loremWordFor(seed: string, originalLen: number): string {
  // Детерминированно подбираем слово из словаря, стараясь попадать по длине.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const start = Math.abs(h) % LOREM_WORDS.length;
  let best = LOREM_WORDS[start];
  let bestDelta = Math.abs(best.length - originalLen);
  for (let i = 0; i < LOREM_WORDS.length; i++) {
    const w = LOREM_WORDS[(start + i) % LOREM_WORDS.length];
    const delta = Math.abs(w.length - originalLen);
    if (delta < bestDelta) { best = w; bestDelta = delta; }
  }
  return best;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getStyleId(pXml: string): string | null {
  const m = /<w:pStyle\s+w:val="([^"]+)"/.exec(pXml);
  return m ? m[1] : null;
}

// Регекс должен матчить ТОЛЬКО <w:t> / <w:t ...>, но не <w:tab>, <w:tabs>,
// <w:tbl>, <w:tblPr> и т.п. После "w:t" требуется пробел, табуляция или ">",
// иначе lorem replace затирал имена соседних элементов/атрибутов и ломал XML.
const WT_OPEN = /<w:t(?=[\s>])[^>]*>/g;
const WT_BLOCK = /(<w:t(?=[\s>])[^>]*>)([\s\S]*?)(<\/w:t>)/g;

function extractParagraphText(pXml: string): string {
  const matches = [...pXml.matchAll(/(<w:t(?=[\s>])[^>]*>)([\s\S]*?)(<\/w:t>)/g)];
  return matches.map((m) => m[2]).join("").trim();
}

function splitBodyBlocks(bodyXml: string): { blocks: string[]; tail: string } {
  const blocks: string[] = [];
  const re = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = re.exec(bodyXml))) {
    blocks.push(m[0]);
    lastEnd = m.index + m[0].length;
  }
  return { blocks, tail: bodyXml.slice(lastEnd) };
}

function findTitleBoundary(blocks: string[]): number {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.startsWith("<w:p")) { continue; }
    const style = getStyleId(block);
    const text = extractParagraphText(block);
    if (style && HEADING_STYLES.has(style)) return i;
    if (text && SECTION_TEXT.test(text)) return i;
    if (i >= 30) return i;
  }
  return Math.min(12, blocks.length);
}

function templateTitleBlocks(): string[] {
  // WorkType «КУРСОВАЯ» — чтобы бенч проверял GOST-tier путь пайплайна
  // (centered titlepage через template-renderer), а не skip/raw-copy.
  // Содержание намеренно разбито на 17 строк, чтобы эвристика
  // findTitleBoundary сходилась в одной и той же точке для всех файлов.
  const lines = [
    "МИНИСТЕРСТВО ОБРАЗОВАНИЯ",
    "Федеральное государственное образовательное учреждение",
    "Учебное заведение N",
    "",
    "Факультет",
    "Кафедра",
    "",
    "КУРСОВАЯ РАБОТА",
    "по дисциплине «Образец дисциплины»",
    "",
    "на тему: «Образец работы»",
    "",
    "Выполнил: Иванов И.И.",
    "Группа: XX-00",
    "Руководитель: Петров П.П., доцент",
    "",
    "Город, 2026",
  ];
  // Центрируем все строки шаблона — иначе бенч ревью видит "не центрирован"
  // на sanitized input ещё до вмешательства пайплайна.
  return lines.map((t) => {
    const content = t
      ? `<w:r><w:t xml:space="preserve">${xmlEscape(t)}</w:t></w:r>`
      : "";
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${content}</w:p>`;
  });
}

// Маски для режима mask.
const PII_REGEXES: Array<{ re: RegExp; with: string }> = [
  { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, with: "[email]" },
  { re: /(?:\+7|8)[\s\-()]*\d[\d\s\-()]{8,}/g, with: "[phone]" },
  { re: /\b\d{4}\s?\d{6}\b/g, with: "[passport]" },
  { re: /\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/g, with: "[snils]" },
  { re: /\bИНН[\s:]*\d{10,12}\b/gi, with: "ИНН [inn]" },
  { re: /\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.\s?/g, with: "[ФИО] " },
  { re: /\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\b/g, with: "[ФИО]" },
];

// Pre-mask: убираем явные PII паттерны ДО lorem-замены.
// IP-адреса, email, телефоны, паспорт, длинные числа — чистим всегда.
// Так мы сохраняем "1.1", "2.3.4", но убираем "100.68.243.78" и «тел. 89991234567».
function preMaskPII(text: string): string {
  return text
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "0.0.0.0")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "mail@example.com")
    .replace(/(?:\+7|8)[\s\-()]*\d[\d\s\-()]{8,}/g, "+70000000000")
    .replace(/\b\d{4}\s?\d{6}\b/g, "0000 000000")
    .replace(/\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/g, "000-000-000 00")
    .replace(/\bИНН[\s:]*\d{10,12}\b/gi, "ИНН 0000000000")
    // Чисто-числовые токены длиннее 4 цифр — подозрение на ИД/код/год-контекст. Маскируем.
    .replace(/\b\d{5,}\b/g, (m) => "0".repeat(m.length));
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isAllCaps(s: string): boolean {
  // Cyrillic + latin caps. Require at least one letter.
  if (!/[А-ЯЁA-Z]/.test(s)) return false;
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

function isTitleCase(s: string): boolean {
  // First letter upper, rest lower (or mixed with lowers). For our corpus
  // sanitiser purposes "Capitalized" token.
  return /^[А-ЯЁA-Z]/.test(s) && s !== s.toUpperCase();
}

function transformText(raw: string, mode: Mode, seed: string): string {
  if (mode === "keep") return raw;
  if (mode === "mask") {
    let out = raw;
    for (const { re, with: w } of PII_REGEXES) out = out.replace(re, w);
    return out;
  }
  // lorem: сначала маскируем PII-паттерны, затем по каждому слову — детерминированная замена.
  // Сохраняем:
  //   - XML entity references (&amp;, &lt;, &#39; и т.п.) — иначе ломаем docx;
  //   - ключевые слова ГОСТ (PRESERVE_WORDS) — нужны checker/structure-analyzer;
  //   - короткие числа ≤4 цифр — номера разделов "1.1", годы, номера страниц;
  //   - регистр исходного слова — ALL CAPS → ALL CAPS, Title → Title, иначе
  //     lowercase. Это даёт осмысленные заголовки (ВВЕДЕНИЕ, Глава 1) и
  //     правильные заглавные буквы в начале предложений.
  const masked = preMaskPII(raw);
  // Track position to detect sentence starts (first letter of text OR after
  // ". ", "! ", "? "). Sentence-start words get their first letter capitalised
  // even if the original was lowercase — fixes "строчные буквы в новых
  // предложениях" issue user reported.
  return masked.replace(/&[a-zA-Z#0-9]+;|[A-Za-zА-Яа-яЁё0-9]+/g, (match, offset: number) => {
    if (match.startsWith("&")) return match;
    if (PRESERVE_WORDS.has(match)) return match;
    if (/^\d+$/.test(match)) return match;
    const lorem = loremWordFor(`${seed}:${offset}:${match}`, match.length);
    // Preserve case shape of original token.
    if (isAllCaps(match)) return lorem.toUpperCase();
    if (isTitleCase(match)) return capitalizeFirst(lorem);
    // Sentence start: if preceding non-space char is ".!?" or start of text.
    const before = masked.slice(Math.max(0, offset - 3), offset);
    if (offset === 0 || /[.!?][\s"'«»]*$/.test(before)) return capitalizeFirst(lorem);
    return lorem;
  });
}

const PRESERVE_WORDS_ARR = [...PRESERVE_WORDS];
function hasPreserveWord(text: string): boolean {
  // \b в JS regex не работает с кириллицей — используем substring-проверку
  // с проверкой границ через соседние символы.
  const notLetter = (ch: string | undefined) => ch === undefined || !/[A-Za-zА-Яа-яЁё]/.test(ch);
  for (const w of PRESERVE_WORDS_ARR) {
    let i = text.indexOf(w);
    while (i !== -1) {
      if (notLetter(text[i - 1]) && notLetter(text[i + w.length])) return true;
      i = text.indexOf(w, i + 1);
    }
  }
  return false;
}

function transformBlockText(blockXml: string, mode: Mode, seed: string): string {
  if (mode === "keep") return blockXml;
  // ВАЖНО: paragraph-level bypass удалён (утекал реальный текст в длинных подписях,
  // напр. "Рисунок 1.2 — Архитектурная схема DevOps Control Hub"). Вместо этого —
  // word-level preserve через transformText: PRESERVE_WORDS остаются дословно,
  // остальное заменяется на lorem. Разбитое по run-ам слово (редкий случай в docx)
  // лучше потерять, чем допустить утечку реальных сущностей.
  return blockXml.replace(WT_BLOCK, (_m, open: string, inner: string, close: string) => {
    const transformed = transformText(inner, mode, seed);
    return `${open}${transformed}${close}`;
  });
}

function stripDocProps(zip: JSZip) {
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:creator>sanitized</dc:creator>
<cp:lastModifiedBy>sanitized</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>`;
  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>sanitized</Application>
<Company></Company>
</Properties>`;
  if (zip.file("docProps/core.xml")) zip.file("docProps/core.xml", coreXml);
  if (zip.file("docProps/app.xml")) zip.file("docProps/app.xml", appXml);
  // Удаляем потенциальные custom.xml и подобные source-specific блобы.
  if (zip.file("docProps/custom.xml")) zip.remove("docProps/custom.xml");
}

// Прозрачный 1x1 PNG — замена для всех картинок в word/media/.
// Убирает утечки логотипов/скриншотов/фото, сохраняя шейпы и подписи.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
// Прозрачный 1x1 GIF — для .gif.
const PLACEHOLDER_GIF = Buffer.from("R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=", "base64");
// Пустой 1x1 JPEG.
const PLACEHOLDER_JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+/iiiigD/2Q==",
  "base64",
);

// Удаляем все embed-шрифты (могут содержать лицензионные данные).
function stripEmbeddedFonts(zip: JSZip) {
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith("word/fonts/") || name.startsWith("word/embeddings/")) {
      zip.remove(name);
    }
  }
}

// Заменяем все изображения на плейсхолдеры того же формата.
function replaceMedia(zip: JSZip) {
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("word/media/")) continue;
    const lower = name.toLowerCase();
    let replacement: Buffer;
    if (lower.endsWith(".png")) replacement = PLACEHOLDER_PNG;
    else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) replacement = PLACEHOLDER_JPG;
    else if (lower.endsWith(".gif")) replacement = PLACEHOLDER_GIF;
    else if (lower.endsWith(".emf") || lower.endsWith(".wmf") || lower.endsWith(".svg") || lower.endsWith(".tiff") || lower.endsWith(".bmp")) {
      // Векторная/устаревшая графика: лог/схемы. Удаляем — Word покажет пустое место.
      zip.remove(name);
      continue;
    } else {
      // Неизвестный формат — на всякий случай удаляем.
      zip.remove(name);
      continue;
    }
    zip.file(name, replacement);
  }
}

// Трансформирует ВЕСЬ XML файла (не разбивая на блоки). Используется для
// header/footer/footnote/endnote/comment — в них нет титульника, зато есть
// реальный текст, имена, контакты, IP. Применяется тот же preserve-keyword
// механизм, но на уровне содержимого одного <w:t>.
function transformXmlGlobal(xml: string, mode: Mode, seed: string): string {
  if (mode === "keep") return xml;
  // В headers/footers/footnotes структурных якорей ГОСТ нет — гоним word-level
  // transform без bypass. PRESERVE_WORDS сохранятся внутри transformText.
  return xml.replace(WT_BLOCK, (_m, open: string, inner: string, close: string) => {
    return `${open}${transformText(inner, mode, seed)}${close}`;
  });
}

// Трансформирует document.xml: спец-обработка титульника, обычные параграфы,
// ПЛЮС paragraphs внутри textbox/shape (w:txbxContent). Тело proходит обычной
// обработкой, textbox — отдельно, потому что splitBodyBlocks не заходит внутрь
// drawings. Без этого утекают подписи в рамках, заголовки схем и т.п.
function transformDocumentXml(xml: string, mode: Mode, seed: string): string {
  const bodyMatch = /(<w:body\b[^>]*>)([\s\S]*?)(<\/w:body>)/.exec(xml);
  if (!bodyMatch) throw new Error("no <w:body>");
  const [, bodyOpen, bodyInner, bodyClose] = bodyMatch;
  const { blocks, tail } = splitBodyBlocks(bodyInner);

  const boundary = findTitleBoundary(blocks);
  const rest = blocks.slice(boundary);
  const newTitle = templateTitleBlocks();
  const transformedRest = rest.map((b) => transformBlockText(b, mode, seed));
  const newBodyInner = newTitle.join("") + transformedRest.join("") + tail;

  // Второй проход: текст внутри drawing/textbox. Эти <w:t> могли остаться нетронутыми,
  // если жили внутри <mc:AlternateContent>/<w:drawing>/<w:txbxContent> — это не блоки
  // <w:p>/<w:tbl> на верхнем уровне body. transformBlockText их не достиг.
  const withTextboxes = newBodyInner.replace(
    /(<w:txbxContent\b[^>]*>)([\s\S]*?)(<\/w:txbxContent>)/g,
    (_m, open: string, inner: string, close: string) => {
      if (mode === "keep") return `${open}${inner}${close}`;
      const transformed = inner.replace(WT_BLOCK, (_mm, o: string, txt: string, c: string) => {
        return `${o}${transformText(txt, mode, seed)}${c}`;
      });
      return `${open}${transformed}${close}`;
    },
  );

  // Третий проход: alt-текст изображений (wp:docPr name="...", descr="..."),
  // в котором могут быть реальные имена файлов и описания (логотипы, фамилии).
  // Скрабим атрибуты точечно, не создавая дубликатов.
  const scrubbedAlt = withTextboxes
    .replace(/(<wp:docPr\b[^>]*?\s)name="[^"]*"/g, (_m, pre: string) => `${pre}name="image"`)
    .replace(/(<wp:docPr\b[^>]*?)\sdescr="[^"]*"/g, (_m, pre: string) => pre)
    .replace(/(<wp:docPr\b[^>]*?)\stitle="[^"]*"/g, (_m, pre: string) => pre);

  return xml.replace(bodyMatch[0], `${bodyOpen}${scrubbedAlt}${bodyClose}`);
}

// Убирает source-embedded TOC из body перед трансформацией. Ищем параграф с
// текстом «ОГЛАВЛЕНИЕ»/«СОДЕРЖАНИЕ», далее выкидываем все последующие <w:p>,
// пока не встретим «Введение» / «Глава» / «Heading1-стиль» — это начало
// реального содержания. Без этого lorem-замена превращает TOC в шумный
// lorem-блок, который pipeline не детектит как TOC и оставляет в PDF.
function stripSourceTOC(bodyXml: string): string {
  const { blocks, tail } = splitBodyBlocks(bodyXml);
  const TOC_TITLE = /^(ОГЛАВЛЕНИЕ|СОДЕРЖАНИЕ|Оглавление|Содержание)\s*$/;
  const CONTENT_START = /^(ВВЕДЕНИЕ|Введение|РЕФЕРАТ|Реферат|АННОТАЦИЯ|Аннотация|ГЛАВА\s+\d|Глава\s+\d|\d+(\.\d+)*\s+[А-ЯA-Z])/;
  const HEADING1 = /<w:pStyle\s+w:val="(Heading1|Title|1)"/;

  const out: string[] = [];
  let i = 0;
  let stripped = false;
  while (i < blocks.length) {
    const b = blocks[i];
    if (!stripped && b.startsWith("<w:p")) {
      const text = extractParagraphText(b);
      if (TOC_TITLE.test(text)) {
        // Сохраняем сам заголовок TOC — pipeline сам либо оставит, либо
        // заменит его через pandoc --toc.
        out.push(b);
        i += 1;
        // Скипаем всё до начала реального содержания.
        while (i < blocks.length) {
          const bb = blocks[i];
          if (bb.startsWith("<w:p")) {
            const tt = extractParagraphText(bb);
            if (CONTENT_START.test(tt) || HEADING1.test(bb)) break;
          }
          i += 1;
        }
        stripped = true;
        continue;
      }
    }
    out.push(b);
    i += 1;
  }
  return out.join("") + tail;
}

async function sanitizeDocx(buf: Buffer, mode: Mode, seed: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) throw new Error("no word/document.xml");
  const xml = await documentXmlFile.async("string");

  // Сначала вычищаем source-TOC прямо в body, потом делаем остальную
  // трансформацию. Порядок важен — stripSourceTOC работает по оригинальному
  // тексту (до lorem-замены), а дальше уже lorem.
  const bodyMatchPre = /(<w:body\b[^>]*>)([\s\S]*?)(<\/w:body>)/.exec(xml);
  let preXml = xml;
  if (bodyMatchPre) {
    const [full, openTag, inner, closeTag] = bodyMatchPre;
    const strippedInner = stripSourceTOC(inner);
    preXml = xml.replace(full, `${openTag}${strippedInner}${closeTag}`);
  }

  const newXml = transformDocumentXml(preXml, mode, seed);
  zip.file("word/document.xml", newXml);

  // Остальные xml-файлы с пользовательским текстом: headers, footers, footnotes, endnotes, comments.
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("word/")) continue;
    if (name === "word/document.xml") continue;
    if (!name.endsWith(".xml")) continue;
    const base = name.slice("word/".length);
    const isScrubTarget =
      /^header\d*\.xml$/.test(base) ||
      /^footer\d*\.xml$/.test(base) ||
      base === "footnotes.xml" ||
      base === "endnotes.xml" ||
      base === "comments.xml" ||
      base === "commentsExtended.xml";
    if (!isScrubTarget) continue;
    const xmlPart = await zip.file(name)!.async("string");
    zip.file(name, transformXmlGlobal(xmlPart, mode, seed));
  }

  replaceMedia(zip);
  stripEmbeddedFonts(zip);
  stripDocProps(zip);

  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

interface ManifestDoc {
  id: string;
  source_document_id?: string;
  work_type?: string;
  raw_path?: string;
  ideal_path?: string | null;
  complexity?: unknown;
  download_status?: string;
  notes?: string;
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1] as Mode | undefined;
  const onlyArg = args.find((a) => a.startsWith("--only="))?.split("=")[1];
  const mode: Mode = modeArg && ["lorem", "mask", "keep"].includes(modeArg) ? modeArg : "lorem";

  const inDir = "data/golden/raw";
  const outDir = "data/golden/sanitized";
  fs.mkdirSync(outDir, { recursive: true });

  const manifestPath = "data/golden/manifest.json";
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : null;

  const files = fs.readdirSync(inDir).filter((f) => f.endsWith(".docx")).sort();
  const target = onlyArg ? files.filter((f) => f.startsWith(onlyArg)) : files;
  console.log(`Sanitize ${target.length}/${files.length} docs (mode=${mode})`);

  const sanitizedDocs: ManifestDoc[] = [];
  for (const f of target) {
    const inPath = path.join(inDir, f);
    const outPath = path.join(outDir, f);
    const buf = fs.readFileSync(inPath);
    const id = f.replace(/\.docx$/, "");
    try {
      const out = await sanitizeDocx(buf, mode, id);
      fs.writeFileSync(outPath, out);
      console.log(`  ok  ${f}  ${(buf.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.error(`  FAIL ${f}: ${(e as Error).message}`);
      continue;
    }
    if (manifest) {
      const src: ManifestDoc | undefined = manifest.documents?.find((d: ManifestDoc) => d.id === id);
      if (src) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { source_document_id: _omit, raw_path: _omit2, ...rest } = src;
        sanitizedDocs.push({ ...rest, raw_path: `data/golden/sanitized/${f}` });
      } else {
        sanitizedDocs.push({ id, raw_path: `data/golden/sanitized/${f}` });
      }
    }
  }

  if (manifest && !onlyArg) {
    const out = {
      generated_at: new Date().toISOString(),
      source: "sanitize-corpus",
      mode,
      summary: manifest.summary,
      documents: sanitizedDocs,
    };
    const sanitizedManifestPath = "data/golden/manifest.sanitized.json";
    fs.writeFileSync(sanitizedManifestPath, JSON.stringify(out, null, 2));
    console.log(`\nManifest: ${sanitizedManifestPath} (${sanitizedDocs.length} docs)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

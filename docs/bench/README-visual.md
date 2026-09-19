# Визуальный бенч pipeline-v7 (метрики по рендеру)

XML-чекер (`src/lib/pipeline-v6/checker`) ставит 97–99/100 документам, которые
пользователь оценивает на 1★: он не видит вёрстку. `scripts/pipeline-v7/bench-visual.ts`
рендерит исходник и выход через LibreOffice (`UpdateFields=true`) и меряет то, что
видит пользователь: число страниц до/после, порядок заголовков в PDF, номера
страниц в содержании против фактических, «Введение» перед первой главой, уцелевший
титул. Прогон идёт по прод-конфигурации (`textNormalization: true`, `llm: undefined`,
затем `fillTocStatic`) — платных вызовов LLM нет.

```bash
npx tsx scripts/pipeline-v7/bench-visual.ts --set=all      # real 25 + synthetic 12
npx tsx scripts/pipeline-v7/bench-visual.ts --set=real --id=<подстрока>
npx tsx scripts/pipeline-v7/bench-visual.ts --accept       # записать golden PDF
```

`report.json` + `report.md` ложатся в `--out` (по умолчанию `/tmp/v7-visual/<timestamp>`)
рядом с выходными docx/pdf; PDF исходников кэшируются по хэшу в `/tmp/v7-visual/.src-cache`.
Пиксельный diff против golden работает только если `diff-pdf` есть на PATH (с 2026-09-20
установлен, `brew install diff-pdf`); если его нет, бенч пишет это в отчёт, а не молча
пропускает. Флаг `pixel-diff` = расхождение с golden. Отчёты не содержат текста
реальных документов: только id, числа и коды флагов.

## Регресс-страж P0: `13-title-page-break.docx`

Синтетический документ `data/corpus/synthetic/13-title-page-break.docx`
(генератор `scripts/pipeline-v7/make-corpus/docs/13-title-page-break.ts`)
воспроизводит P0 с прода: первая строка титульного листа несёт ручной
`<w:br w:type="page"/>`, из-за чего классификатор схлопывает область титула до
одного абзаца и точка вставки оглавления уезжает внутрь титульного листа.
Содержание при этом набрано руками — жирная строка «СОДЕРЖАНИЕ» плюс строки с
точечными лидерами, без стилей TOC.

Ожидаемое поведение (проверяется `npx tsx scripts/pipeline-v7/bench.ts --set=synthetic`):
своё оглавление не вставляется — `tocSkipped: toc-heading-present`, рукописное
содержание распознано; разрыв после титула тоже не вставляется —
`titleBreakSkipped: title-too-short`, гейт пройден, score 100.

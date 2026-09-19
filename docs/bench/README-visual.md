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
Пиксельный diff против golden работает только если `diff-pdf` есть на PATH — сейчас он не
установлен, и бенч это пишет в отчёт, а не молча пропускает. Отчёты не содержат текста
реальных документов: только id, числа и коды флагов.

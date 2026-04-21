// Перенесено в src/lib/pipeline-v6/checker/ в Неделе 1 pipeline-v6.
// Этот файл оставлен как re-export для обратной совместимости с
// format-quality-bench.ts / bench-1star-replay.ts / batch-test.ts / pipeline-standalone.ts.
// Удалить после миграции этих скриптов на прямой импорт.

export {
  runQualityChecks,
  type CheckSeverity,
  type CheckResult,
  type QualityReport,
} from "../src/lib/pipeline-v6/checker";

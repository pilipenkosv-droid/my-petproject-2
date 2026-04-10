import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Существующий код использует any в XML-парсинге — подавляем до рефакторинга
      "@typescript-eslint/no-explicit-any": "warn",
      // Unused vars — предупреждение, не ошибка (есть утилиты в разработке)
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      // Пустые интерфейсы используются как маркерные типы
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
];

export default eslintConfig;

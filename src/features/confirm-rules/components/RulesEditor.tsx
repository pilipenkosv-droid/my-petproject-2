"use client";

import { useState } from "react";
import { FormattingRules } from "@/types/formatting-rules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Type, 
  AlignJustify, 
  List, 
  BookOpen,
  ChevronDown,
  ChevronRight,
  Edit2,
  Check,
  X
} from "lucide-react";

interface RulesEditorProps {
  rules: FormattingRules;
  onChange: (rules: FormattingRules) => void;
  warnings?: string[];
  missingRules?: string[];
  confidence?: number;
}

type EditableField = {
  path: string[];
  label: string;
  value: string | number | boolean;
  type: "text" | "number" | "boolean" | "select";
  options?: { value: string; label: string }[];
};

export function RulesEditor({ 
  rules, 
  onChange, 
  warnings = [], 
  missingRules = [],
  confidence = 1 
}: RulesEditorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["document", "text", "headings"])
  );
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const startEditing = (path: string, currentValue: string | number | boolean) => {
    setEditingField(path);
    setTempValue(String(currentValue));
  };

  const cancelEditing = () => {
    setEditingField(null);
    setTempValue("");
  };

  const saveEdit = (path: string[], type: "text" | "number" | "boolean") => {
    const newRules = JSON.parse(JSON.stringify(rules)) as FormattingRules;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let target: any = newRules;
    
    for (let i = 0; i < path.length - 1; i++) {
      target = target[path[i]];
    }
    
    const lastKey = path[path.length - 1];
    if (type === "number") {
      target[lastKey] = parseFloat(tempValue) || 0;
    } else if (type === "boolean") {
      target[lastKey] = tempValue === "true";
    } else {
      target[lastKey] = tempValue;
    }
    
    onChange(newRules);
    setEditingField(null);
    setTempValue("");
  };

  const renderField = (
    label: string, 
    value: string | number | boolean | undefined, 
    path: string[],
    type: "text" | "number" | "boolean" = "text"
  ) => {
    const pathStr = path.join(".");
    const isEditing = editingField === pathStr;
    const displayValue = value === undefined ? "—" : String(value);

    return (
      <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0">
        <span className="text-sm text-white/70">{label}</span>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              {type === "boolean" ? (
                <select
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white"
                >
                  <option value="true">Да</option>
                  <option value="false">Нет</option>
                </select>
              ) : (
                <input
                  type={type === "number" ? "number" : "text"}
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  className="w-32 bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white"
                  autoFocus
                />
              )}
              <button
                onClick={() => saveEdit(path, type)}
                className="p-1 hover:bg-emerald-500/20 rounded transition-colors"
              >
                <Check className="h-4 w-4 text-emerald-400" />
              </button>
              <button
                onClick={cancelEditing}
                className="p-1 hover:bg-red-500/20 rounded transition-colors"
              >
                <X className="h-4 w-4 text-red-400" />
              </button>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-white">{displayValue}</span>
              {value !== undefined && (
                <button
                  onClick={() => startEditing(pathStr, value)}
                  className="p-1 hover:bg-white/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Edit2 className="h-3 w-3 text-white/50" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderSection = (
    id: string,
    title: string,
    icon: React.ReactNode,
    gradient: string,
    children: React.ReactNode
  ) => {
    const isExpanded = expandedSections.has(id);

    return (
      <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              {icon}
            </div>
            <span className="font-medium text-white">{title}</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-white/50" />
          ) : (
            <ChevronRight className="h-5 w-5 text-white/50" />
          )}
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 group">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Уверенность и предупреждения */}
      {(confidence < 0.8 || warnings.length > 0) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-amber-400 text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Обратите внимание
            </CardTitle>
          </CardHeader>
          <CardContent>
            {confidence < 0.8 && (
              <p className="text-sm text-amber-200/80 mb-2">
                Уверенность извлечения правил: {Math.round(confidence * 100)}%
              </p>
            )}
            {warnings.length > 0 && (
              <ul className="text-sm text-amber-200/80 space-y-1">
                {warnings.map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Секции правил */}
      <div className="space-y-3">
        {/* Параметры страницы */}
        {renderSection(
          "document",
          "Параметры страницы",
          <FileText className="h-5 w-5 text-white" />,
          "from-violet-500 to-purple-600",
          <div className="space-y-1">
            {renderField("Размер страницы", rules.document.pageSize, ["document", "pageSize"], "text")}
            {renderField("Ориентация", rules.document.orientation === "portrait" ? "Книжная" : "Альбомная", ["document", "orientation"], "text")}
            {renderField("Верхнее поле (мм)", rules.document.margins.top, ["document", "margins", "top"], "number")}
            {renderField("Нижнее поле (мм)", rules.document.margins.bottom, ["document", "margins", "bottom"], "number")}
            {renderField("Левое поле (мм)", rules.document.margins.left, ["document", "margins", "left"], "number")}
            {renderField("Правое поле (мм)", rules.document.margins.right, ["document", "margins", "right"], "number")}
          </div>
        )}

        {/* Основной текст */}
        {renderSection(
          "text",
          "Основной текст",
          <Type className="h-5 w-5 text-white" />,
          "from-indigo-500 to-blue-600",
          <div className="space-y-1">
            {renderField("Шрифт", rules.text.fontFamily, ["text", "fontFamily"], "text")}
            {renderField("Размер шрифта (pt)", rules.text.fontSize, ["text", "fontSize"], "number")}
            {renderField("Межстрочный интервал", rules.text.lineSpacing, ["text", "lineSpacing"], "number")}
            {renderField("Абзацный отступ (мм)", rules.text.paragraphIndent, ["text", "paragraphIndent"], "number")}
            {renderField("Выравнивание", translateAlignment(rules.text.alignment), ["text", "alignment"], "text")}
          </div>
        )}

        {/* Заголовки */}
        {renderSection(
          "headings",
          "Заголовки",
          <AlignJustify className="h-5 w-5 text-white" />,
          "from-emerald-500 to-teal-600",
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Заголовок 1 уровня (главы)</p>
              <div className="pl-3 border-l-2 border-white/10">
                {renderField("Размер (pt)", rules.headings.level1.fontSize, ["headings", "level1", "fontSize"], "number")}
                {renderField("Жирный", rules.headings.level1.bold, ["headings", "level1", "bold"], "boolean")}
                {renderField("Прописные", rules.headings.level1.uppercase, ["headings", "level1", "uppercase"], "boolean")}
                {renderField("Выравнивание", translateAlignment(rules.headings.level1.alignment), ["headings", "level1", "alignment"], "text")}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Заголовок 2 уровня (разделы)</p>
              <div className="pl-3 border-l-2 border-white/10">
                {renderField("Размер (pt)", rules.headings.level2.fontSize, ["headings", "level2", "fontSize"], "number")}
                {renderField("Жирный", rules.headings.level2.bold, ["headings", "level2", "bold"], "boolean")}
                {renderField("Выравнивание", translateAlignment(rules.headings.level2.alignment), ["headings", "level2", "alignment"], "text")}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Заголовок 3 уровня (подразделы)</p>
              <div className="pl-3 border-l-2 border-white/10">
                {renderField("Размер (pt)", rules.headings.level3.fontSize, ["headings", "level3", "fontSize"], "number")}
                {renderField("Жирный", rules.headings.level3.bold, ["headings", "level3", "bold"], "boolean")}
                {renderField("Курсив", rules.headings.level3.italic, ["headings", "level3", "italic"], "boolean")}
              </div>
            </div>
          </div>
        )}

        {/* Списки */}
        {renderSection(
          "lists",
          "Списки",
          <List className="h-5 w-5 text-white" />,
          "from-rose-500 to-pink-600",
          <div className="space-y-1">
            {renderField("Маркер списка", rules.lists.bulletStyle, ["lists", "bulletStyle"], "text")}
            {renderField("Формат нумерации", rules.lists.numberingStyle, ["lists", "numberingStyle"], "text")}
            {renderField("Отступ (мм)", rules.lists.indent, ["lists", "indent"], "number")}
          </div>
        )}

        {/* Специальные элементы */}
        {renderSection(
          "special",
          "Специальные элементы",
          <BookOpen className="h-5 w-5 text-white" />,
          "from-amber-500 to-orange-600",
          <div className="space-y-4">
            {rules.specialElements.bibliography && (
              <div>
                <p className="text-xs text-white/50 mb-2">Список литературы</p>
                <div className="pl-3 border-l-2 border-white/10">
                  {renderField("Заголовок", rules.specialElements.bibliography.title, ["specialElements", "bibliography", "title"], "text")}
                  {renderField("Стиль", rules.specialElements.bibliography.style?.toUpperCase(), ["specialElements", "bibliography", "style"], "text")}
                </div>
              </div>
            )}
            {rules.specialElements.figures && (
              <div>
                <p className="text-xs text-white/50 mb-2">Рисунки</p>
                <div className="pl-3 border-l-2 border-white/10">
                  {renderField("Подпись", rules.specialElements.figures.captionPrefix, ["specialElements", "figures", "captionPrefix"], "text")}
                  {renderField("Позиция подписи", rules.specialElements.figures.captionPosition === "above" ? "Над" : "Под", ["specialElements", "figures", "captionPosition"], "text")}
                </div>
              </div>
            )}
            {rules.specialElements.tables && (
              <div>
                <p className="text-xs text-white/50 mb-2">Таблицы</p>
                <div className="pl-3 border-l-2 border-white/10">
                  {renderField("Подпись", rules.specialElements.tables.captionPrefix, ["specialElements", "tables", "captionPrefix"], "text")}
                  {renderField("Позиция подписи", rules.specialElements.tables.captionPosition === "above" ? "Над" : "Под", ["specialElements", "tables", "captionPosition"], "text")}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Нераспознанные правила */}
      {missingRules.length > 0 && (
        <Card className="border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/70 text-sm">
              Используются значения по умолчанию
            </CardTitle>
            <CardDescription>
              Для этих правил не найдено явных указаний в методичке
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-white/50 space-y-1">
              {missingRules.map((rule, i) => (
                <li key={i}>• {rule}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function translateAlignment(alignment?: string): string {
  const translations: Record<string, string> = {
    left: "По левому краю",
    center: "По центру",
    right: "По правому краю",
    justify: "По ширине",
  };
  return alignment ? translations[alignment] || alignment : "—";
}

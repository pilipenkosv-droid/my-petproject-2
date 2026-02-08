"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircleQuestion, Send, Loader2, Bot, User, ChevronDown, ChevronUp } from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface GuidelinesChatProps {
  jobId: string;
}

const SUGGESTED_QUESTIONS = [
  "Какой шрифт и размер текста?",
  "Какие поля страницы?",
  "Как оформлять заголовки?",
  "Какой межстрочный интервал?",
  "Как нумеровать страницы?",
];

export function GuidelinesChat({ jobId }: GuidelinesChatProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: question.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    trackEvent("chat_question", { jobId, questionLength: question.length });

    try {
      const response = await fetch("/api/ask-guidelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          question: question.trim(),
          history: messages.slice(-10),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка при получении ответа");
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.answer,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, jobId, messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <Card className="border-border/50">
      {/* Header — always visible, clickable to expand */}
      <CardHeader
        className="cursor-pointer select-none py-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <MessageCircleQuestion className="w-5 h-5 text-indigo-500" />
            Спросить у методички
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Messages area */}
          {messages.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center mt-0.5">
                      <Bot className="w-4 h-4 text-indigo-500" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap",
                      msg.role === "user"
                        ? "bg-indigo-500/10 text-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center mt-0.5">
                    <Bot className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Suggested questions — only when no messages */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setIsExpanded(true);
                    sendMessage(q);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Задайте вопрос о методичке..."
              rows={1}
              className="flex-1 resize-none rounded-md border border-border/50 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              disabled={isLoading || !input.trim()}
              className="shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}

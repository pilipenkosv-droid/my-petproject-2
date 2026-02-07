"use client";

import { useState, useEffect, useRef } from "react";
import {
  Link as LinkIcon,
  Check,
  Send,
  Share2,
  Twitter,
} from "lucide-react";

interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string;
  variant?: "default" | "compact";
}

const VKIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M21.547 7H16.86a.535.535 0 0 0-.482.304c-.327.666-1.108 2.204-1.86 3.132-.502.62-.86.858-1.108.858-.182 0-.302-.17-.302-.658V7.53c0-.484-.078-.765-.592-.765h-2.42c-.35 0-.592.26-.592.504 0 .528.79.65.87 2.138v3.228c0 .708-.128.838-.406.838-.748 0-2.566-2.746-3.644-5.886C6.636 7.168 6.35 7 5.924 7H1.906c-.508 0-.606.24-.606.504 0 .58.748 3.466 3.484 7.28C6.606 17.66 9.136 19 11.416 19c1.374 0 1.542-.308 1.542-.838v-2.098c0-.51.108-.612.468-.612.266 0 .722.134 1.786 1.156 1.216 1.216 1.416 1.762 2.1 1.762h3.172c.506 0 .76-.308.614-.916-.16-.606-.736-1.486-1.5-2.53-.414-.518-1.036-1.076-1.224-1.354-.266-.342-.19-.496 0-.802 0 0 2.668-3.754 2.946-5.028.134-.466-.012-.804-.504-.804z" />
  </svg>
);

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

const shareButtons = [
  {
    key: "telegram",
    label: "Telegram",
    icon: Send,
    getUrl: (url: string, title: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    hoverColor: "hover:text-blue-400 hover:border-blue-400/30",
  },
  {
    key: "vk",
    label: "VK",
    icon: VKIcon,
    getUrl: (url: string, title: string) =>
      `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    hoverColor: "hover:text-blue-500 hover:border-blue-500/30",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: WhatsAppIcon,
    getUrl: (url: string, title: string) =>
      `https://wa.me/?text=${encodeURIComponent(title + " " + url)}`,
    hoverColor: "hover:text-green-400 hover:border-green-400/30",
  },
  {
    key: "twitter",
    label: "Twitter",
    icon: Twitter,
    getUrl: (url: string, title: string) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    hoverColor: "hover:text-sky-400 hover:border-sky-400/30",
  },
];

const btnBase =
  "group relative flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-surface-border backdrop-blur-sm text-on-surface-muted text-sm font-medium hover:bg-surface-hover hover:border-surface-border hover:text-foreground active:scale-95 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

export function ShareButtons({
  url,
  title,
  description,
  variant = "default",
}: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [supportsNativeShare, setSupportsNativeShare] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupportsNativeShare(
      typeof navigator !== "undefined" && !!navigator.share
    );
  }, []);

  // Закрытие попапа при клике вне
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleCopy = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Фоллбэк для старых браузеров
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!navigator.share) return;
    try {
      await navigator.share({ url, title, text: description || title });
    } catch {
      // Пользователь отменил
    }
  };

  // ─── Compact вариант ───
  if (variant === "compact") {
    return (
      <div
        ref={popoverRef}
        className="relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          aria-label="Поделиться"
          aria-expanded={isOpen}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface border border-surface-border text-muted-foreground hover:bg-surface-hover hover:text-on-surface-muted hover:border-surface-border active:scale-95 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>

        {isOpen && (
          <div className="absolute bottom-full right-0 mb-2 z-50 flex items-center gap-1 p-1.5 rounded-xl bg-popover border border-surface-border backdrop-blur-xl shadow-xl shadow-black/20 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Копировать */}
            <button
              onClick={handleCopy}
              aria-label={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300 active:scale-90 ${
                copied
                  ? "bg-green-500/20 text-green-400"
                  : "text-on-surface-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
            </button>

            {/* Соцсети */}
            {shareButtons.map((btn) => (
              <a
                key={btn.key}
                href={btn.getUrl(url, title)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Поделиться в ${btn.label}`}
                className={`flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-muted hover:bg-surface-hover transition-all duration-300 active:scale-90 ${btn.hoverColor}`}
              >
                <btn.icon className="w-3.5 h-3.5" />
              </a>
            ))}

            {/* Нативный шаринг (мобилка) */}
            {supportsNativeShare && (
              <button
                onClick={handleNativeShare}
                aria-label="Поделиться"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-muted hover:bg-surface-hover hover:text-foreground transition-all duration-300 active:scale-90 md:hidden"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Default вариант ───
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Копировать ссылку */}
      <button
        onClick={handleCopy}
        aria-label={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        className={`${btnBase} ${
          copied
            ? "!bg-green-500/20 !border-green-500/40 !text-green-400"
            : ""
        }`}
      >
        {copied ? (
          <Check className="w-4 h-4" />
        ) : (
          <LinkIcon className="w-4 h-4" />
        )}
        <span>{copied ? "Скопировано" : "Копировать"}</span>
      </button>

      {/* Соцсети */}
      {shareButtons.map((btn) => (
        <a
          key={btn.key}
          href={btn.getUrl(url, title)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Поделиться в ${btn.label}`}
          className={`${btnBase} ${btn.hoverColor}`}
        >
          <btn.icon className="w-4 h-4 transition-colors" />
          <span>{btn.label}</span>
        </a>
      ))}

      {/* Нативный шаринг (мобилка) */}
      {supportsNativeShare && (
        <button
          onClick={handleNativeShare}
          aria-label="Поделиться"
          className={`${btnBase} md:hidden`}
        >
          <Share2 className="w-4 h-4" />
          <span>Ещё</span>
        </button>
      )}
    </div>
  );
}

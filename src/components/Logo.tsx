/**
 * SmartFormat Logo component.
 *
 * Variants:
 *  - "favicon"  — icon with purple gradient background (for app icon / small contexts)
 *  - "dark"     — white mark on transparent bg (for dark backgrounds)
 *  - "light"    — dark purple mark on transparent bg (for light backgrounds)
 *
 * `withText` adds the "SmartFormat" wordmark next to the icon.
 */

interface LogoProps {
  /** Visual variant */
  variant?: "favicon" | "dark" | "light";
  /** Size of the icon in px */
  size?: number;
  /** Show "SmartFormat" text next to the icon */
  withText?: boolean;
  /** Extra className on the wrapper */
  className?: string;
}

/* The S-curve path used across all variants */
const FLOW_PATH =
  "M8 20 C8 13, 13 10, 16 10 C19.5 10, 19.5 14.5, 16 16.5 C12.5 18.5, 12.5 23, 16 23 C20 23, 24 18, 24 12";

/* ── Icon sub-components ─────────────────────────────────── */

function FaviconIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logo-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#667eea" />
          <stop offset="100%" stopColor="#764ba2" />
        </linearGradient>
        <linearGradient id="logo-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity={0.5} />
          <stop offset="50%" stopColor="white" stopOpacity={1} />
          <stop offset="100%" stopColor="white" stopOpacity={0.6} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-bg)" />
      <path
        d={FLOW_PATH}
        stroke="url(#logo-stroke)"
        strokeWidth={2.8}
        strokeLinecap="round"
      />
      <path
        d={FLOW_PATH}
        stroke="white"
        strokeWidth={5}
        strokeLinecap="round"
        strokeOpacity={0.1}
      />
    </svg>
  );
}

function DarkIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logo-dark-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity={0.5} />
          <stop offset="50%" stopColor="white" stopOpacity={1} />
          <stop offset="100%" stopColor="white" stopOpacity={0.6} />
        </linearGradient>
      </defs>
      <path
        d={FLOW_PATH}
        stroke="url(#logo-dark-stroke)"
        strokeWidth={2.8}
        strokeLinecap="round"
      />
      <path
        d={FLOW_PATH}
        stroke="white"
        strokeWidth={5}
        strokeLinecap="round"
        strokeOpacity={0.08}
      />
    </svg>
  );
}

function LightIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logo-light-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#667eea" />
          <stop offset="100%" stopColor="#764ba2" />
        </linearGradient>
      </defs>
      <path
        d={FLOW_PATH}
        stroke="url(#logo-light-stroke)"
        strokeWidth={2.8}
        strokeLinecap="round"
      />
      <path
        d={FLOW_PATH}
        stroke="#764ba2"
        strokeWidth={5}
        strokeLinecap="round"
        strokeOpacity={0.1}
      />
    </svg>
  );
}

/* ── Main component ──────────────────────────────────────── */

export function Logo({
  variant = "dark",
  size = 32,
  withText = false,
  className = "",
}: LogoProps) {
  const Icon =
    variant === "favicon"
      ? FaviconIcon
      : variant === "light"
        ? LightIcon
        : DarkIcon;

  if (!withText) {
    return (
      <span className={`inline-flex items-center ${className}`}>
        <Icon size={size} />
      </span>
    );
  }

  const textSize =
    size >= 48 ? "text-3xl" : size >= 32 ? "text-xl" : "text-lg";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Icon size={size} />
      <span className={`font-bold leading-tight ${textSize}`}>
        {variant === "light" ? (
          <>
            <span className="gradient-text">Smart</span>
            <span className="text-foreground">Format</span>
          </>
        ) : (
          <>
            <span className="gradient-text">Smart</span>
            <span className="text-foreground">Format</span>
          </>
        )}
      </span>
    </span>
  );
}

/**
 * Diplox Logo component.
 *
 * Renders the D icon mark (PNG) with optional "Diplox" wordmark.
 *
 * Variants:
 *  - "favicon"  — D icon on gradient background (rounded rect, for small contexts)
 *  - "dark"     — white D on transparent bg (for dark backgrounds)
 *  - "light"    — gradient D on transparent bg (for light backgrounds)
 *
 * `withText` adds the "Diplox" wordmark next to the icon.
 */

import Image from "next/image";

interface LogoProps {
  /** Visual variant */
  variant?: "favicon" | "dark" | "light";
  /** Size of the icon in px */
  size?: number;
  /** Show "Diplox" text next to the icon */
  withText?: boolean;
  /** Extra className on the wrapper */
  className?: string;
}

export function Logo({
  variant = "dark",
  size = 32,
  withText = false,
  className = "",
}: LogoProps) {
  const iconSrc =
    variant === "light"
      ? "/logo/d-icon.png"
      : "/logo/d-icon-white.png";

  const icon =
    variant === "favicon" ? (
      <span
        className="inline-flex items-center justify-center rounded-lg overflow-hidden"
        style={{
          width: size,
          height: size,
          background: "var(--gradient-primary)",
          padding: Math.round(size * 0.12),
        }}
      >
        <Image
          src="/logo/d-icon-white.png"
          alt=""
          width={Math.round(size * 0.76)}
          height={Math.round(size * 0.76)}
          className="object-contain"
          unoptimized
        />
      </span>
    ) : (
      <Image
        src={iconSrc}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        unoptimized
      />
    );

  if (!withText) {
    return (
      <span className={`inline-flex items-center ${className}`}>
        {icon}
      </span>
    );
  }

  const textSize =
    size >= 48 ? "text-3xl" : size >= 32 ? "text-xl" : "text-lg";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {icon}
      <span className={`font-bold leading-tight font-logo ${textSize}`}>
        <span className="gradient-text">Diplox</span>
      </span>
    </span>
  );
}

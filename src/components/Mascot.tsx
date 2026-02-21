import Image from "next/image";

interface MascotProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}

export function Mascot({ src, alt, width, height, className, priority }: MascotProps) {
  return (
    <div style={{ maxWidth: width }} className={className}>
      <div className="relative">
        {/* White blob background — visible in both themes to mask imperfect cutouts */}
        <div
          className="absolute inset-0 bg-white rounded-[50%] scale-105 blur-xl opacity-60"
          aria-hidden="true"
        />
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="relative w-full h-auto drop-shadow-lg"
          priority={priority}
        />
      </div>
    </div>
  );
}

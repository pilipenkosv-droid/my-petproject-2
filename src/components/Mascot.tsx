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
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="w-full h-auto drop-shadow-lg"
        priority={priority}
      />
    </div>
  );
}

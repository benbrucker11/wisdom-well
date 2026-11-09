import Image from "next/image";

/**
 * Wisdom Well logo marks, from the approved production asset package
 * (Wisdom-Well-Logo-Package, 2026-09). Never rebuild these from text or
 * approximate geometry — recolor, restretch, or add a shadow either — per
 * the package's own usage rules.
 */

/** Symbol only — compact UI, small icon-only contexts. */
export function SymbolMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/symbol.png"
      alt="Wisdom Well"
      width={40}
      height={31}
      priority
      className={className}
    />
  );
}

/**
 * Header lockup: the symbol beside the wordmark-only file (package file 09).
 * Two supplied assets placed side by side — not rebuilt from text — so the
 * name stays legible at header size. The tagline lives on the landing page,
 * where it can be read.
 */
export function HeaderLogo({ wordmarkWidth = 150 }: { wordmarkWidth?: number }) {
  const wordmarkHeight = Math.round(wordmarkWidth * (255 / 1295));
  const symbolHeight = Math.round(wordmarkHeight * 1.45);
  const symbolWidth = Math.round(symbolHeight * (1024 / 792));
  return (
    <span className="flex items-center gap-2.5">
      <Image
        src="/brand/symbol.png"
        alt=""
        width={symbolWidth}
        height={symbolHeight}
        priority
      />
      <Image
        src="/brand/wordmark.png"
        alt="Wisdom Well"
        width={wordmarkWidth}
        height={wordmarkHeight}
        priority
      />
    </span>
  );
}

/** Tagline-only file (package file 10) — "Keep close what matters most." */
export function TaglineMark({ width = 320 }: { width?: number }) {
  const height = Math.round(width * (175 / 1135));
  return (
    <Image
      src="/brand/tagline.png"
      alt="Keep close what matters most."
      width={width}
      height={height}
    />
  );
}

/** Wide wordmark lockup — the header, or anywhere a horizontal strip fits. */
export function HorizontalLogo({
  width = 200,
  className,
}: {
  width?: number;
  className?: string;
}) {
  const height = Math.round(width * (275 / 900));
  return (
    <Image
      src="/brand/horizontal.png"
      alt="Wisdom Well — Keep close what matters most."
      width={width}
      height={height}
      priority
      className={className}
    />
  );
}

/** Primary stacked lockup (symbol + wordmark + tagline) — brand moments, hero. */
export function StackedLogo({ width = 220 }: { width?: number }) {
  const height = Math.round(width * (960 / 1200));
  return (
    <Image
      src="/brand/primary-stacked.png"
      alt="Wisdom Well — Keep close what matters most."
      width={width}
      height={height}
      priority
    />
  );
}

/** Reversed lockup for dark surfaces — footer, Deep Well sections. */
export function ReversedLogo({ width = 160 }: { width?: number }) {
  const height = Math.round(width * (960 / 1200));
  return (
    <Image
      src="/brand/reversed.png"
      alt="Wisdom Well — Keep close what matters most."
      width={width}
      height={height}
    />
  );
}

import Image from "next/image";

/**
 * Wisdom Well logo marks, from the approved production asset package.
 * Never rebuild these from text or approximate geometry — brand guidelines §3.
 */

/** Symbol only — compact UI, used in the app navigation. */
export function SymbolMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/symbol.png"
      alt="Wisdom Well"
      width={40}
      height={34}
      priority
      className={className}
    />
  );
}

/** Primary stacked lockup (symbol + wordmark + tagline) — brand moments, hero. */
export function StackedLogo({ width = 220 }: { width?: number }) {
  const height = Math.round(width * (1026 / 1360));
  return (
    <Image
      src="/brand/primary-stacked.png"
      alt="Wisdom Well — Generations matter"
      width={width}
      height={height}
      priority
    />
  );
}

/** Reversed horizontal lockup on Deep Well — dark sections, footer. */
export function ReversedHorizontalLogo({ width = 200 }: { width?: number }) {
  const height = Math.round(width * (640 / 2022));
  return (
    <Image
      src="/brand/horizontal-reversed.png"
      alt="Wisdom Well — Keep close what matters most."
      width={width}
      height={height}
    />
  );
}

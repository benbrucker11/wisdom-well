/**
 * "Your well" — a cut-away stone well whose water rises with each piece of
 * wisdom saved. Pure SVG, brand palette (stone + Deep Well + Water). `fill` is
 * 0–1 for the current level (see lib/well.ts).
 */
export function WellGraphic({
  fill,
  level,
  label,
  size = 200,
}: {
  fill: number;
  level: number;
  label: string;
  size?: number;
}) {
  const clamped = Math.min(1, Math.max(0, fill));
  // Shaft interior runs y=46..150 (104px).
  const shaftTop = 46;
  const shaftBottom = 150;
  const waterTop = shaftBottom - clamped * (shaftBottom - shaftTop - 6);
  const stone = "#a8998a";
  const stoneLight = "#cbbfae";
  const mortar = "#8f8170";
  const rows = [58, 76, 94, 112, 130];

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 200 176"
      width={size}
      height={(size * 176) / 200}
    >
      <title>{label}</title>
      {/* shaft interior */}
      <rect x="48" y={shaftTop} width="104" height={shaftBottom - shaftTop} fill="var(--color-well-ink)" />
      {/* water */}
      {clamped > 0 ? (
        <>
          <rect x="48" y={waterTop} width="104" height={shaftBottom - waterTop} fill="var(--color-well)" />
          <rect x="48" y={waterTop} width="104" height={Math.min(10, shaftBottom - waterTop)} fill="var(--color-water)" opacity="0.55" />
          <path
            d={`M48 ${waterTop} q13 -4 26 0 t26 0 t26 0 t26 0`}
            fill="none"
            stroke="var(--color-water)"
            strokeWidth="2"
          />
        </>
      ) : null}
      {/* stone walls, left and right, with mortar lines */}
      {[18, 152].map((x) => (
        <g key={x}>
          <rect x={x} y="40" width="30" height="116" rx="4" fill={stone} />
          {rows.map((y, i) => (
            <line key={y} x1={x} x2={x + 30} y1={y + (i % 2 ? 2 : 0)} y2={y + (i % 2 ? 2 : 0)} stroke={mortar} strokeWidth="2" />
          ))}
          {rows.map((y, i) => (
            <line
              key={`v${y}`}
              x1={x + (i % 2 ? 12 : 18)}
              x2={x + (i % 2 ? 12 : 18)}
              y1={y - 16}
              y2={y}
              stroke={mortar}
              strokeWidth="2"
            />
          ))}
        </g>
      ))}
      {/* base */}
      <rect x="14" y="150" width="172" height="20" rx="6" fill={stone} />
      <line x1="60" x2="60" y1="150" y2="170" stroke={mortar} strokeWidth="2" />
      <line x1="140" x2="140" y1="150" y2="170" stroke={mortar} strokeWidth="2" />
      {/* rim */}
      <ellipse cx="100" cy="40" rx="86" ry="14" fill={stoneLight} />
      <ellipse cx="100" cy="40" rx="56" ry="7" fill="var(--color-well-ink)" />
      {/* level badge */}
      <g>
        <circle cx="172" cy="22" r="17" fill="var(--color-ivory)" stroke="var(--color-well)" strokeWidth="2" />
        <text x="172" y="27" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--color-well)">
          {level}
        </text>
      </g>
    </svg>
  );
}

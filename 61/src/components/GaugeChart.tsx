interface GaugeChartProps {
  value: number;
  min: number;
  max: number;
  unit?: string;
  title?: string;
  size?: number;
}

export default function GaugeChart({ value, min, max, unit = '', title, size = 200 }: GaugeChartProps) {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = ratio * 180;

  const cx = size / 2;
  const cy = size * 0.6;
  const radius = size * 0.38;
  const strokeWidth = size * 0.06;

  const color = ratio < 0.5
    ? `rgb(${Math.round(ratio * 2 * 255)}, ${Math.round(200 + ratio * 55)}, ${Math.round(100 - ratio * 100)})`
    : `rgb(255, ${Math.round((1 - ratio) * 2 * 200)}, ${Math.round((1 - ratio) * 50)})`;

  const startAngle = Math.PI;
  const endAngle = Math.PI + (angle * Math.PI) / 180;
  const arcX = cx + radius * Math.cos(endAngle);
  const arcY = cy - radius * Math.sin(endAngle);
  const largeArc = angle > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      {title && (
        <div className="font-mono text-xs text-status-offline mb-1 truncate max-w-full">{title}</div>
      )}
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="#30363d"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {ratio > 0 && (
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 ${largeArc} 1 ${arcX} ${arcY}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        <text
          x={cx}
          y={cy - radius * 0.2}
          textAnchor="middle"
          fill="#e6edf3"
          fontSize={size * 0.14}
          fontFamily="JetBrains Mono, monospace"
          fontWeight="bold"
        >
          {value.toFixed(1)}
        </text>
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fill="#6b7280"
          fontSize={size * 0.07}
        >
          {unit}
        </text>
        <text x={cx - radius - 4} y={cy + size * 0.08} textAnchor="middle" fill="#484f58" fontSize={size * 0.06}>
          {min}
        </text>
        <text x={cx + radius + 4} y={cy + size * 0.08} textAnchor="middle" fill="#484f58" fontSize={size * 0.06}>
          {max}
        </text>
      </svg>
    </div>
  );
}

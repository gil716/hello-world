interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  accent?: string;
}

export function Slider({ label, value, min, max, step = 1, format, onChange, accent = '#3b82f6' }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const displayValue = format ? format(value) : String(value);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs text-gray-400 uppercase tracking-wide">{label}</label>
        <span className="text-sm font-semibold text-white tabular-nums">{displayValue}</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${accent} ${pct}%, #374151 ${pct}%)`,
          }}
        />
      </div>
    </div>
  );
}

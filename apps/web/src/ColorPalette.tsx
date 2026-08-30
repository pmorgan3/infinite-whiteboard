import { useRef } from 'react';

const PRESET_COLORS = [
  '#1f2937',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
];

interface ColorPaletteProps {
  selected: string;
  onSelect: (color: string) => void;
}

export default function ColorPalette({ selected, onSelect }: ColorPaletteProps) {
  const customRef = useRef<HTMLInputElement>(null);

  return (
    <div className="color-palette">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          className={`color-swatch${selected === c ? ' active' : ''}`}
          style={{
            backgroundColor: c,
            border: c === '#ffffff' ? '2px solid var(--swatch-border)' : undefined,
          }}
          onClick={() => onSelect(c)}
          title={c}
        >
          {selected === c ? '✓' : ''}
        </button>
      ))}
      <button
        className="color-swatch custom-swatch"
        onClick={() => customRef.current?.click()}
        title="Custom color"
      >
        +
      </button>
      <input
        ref={customRef}
        type="color"
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
    </div>
  );
}
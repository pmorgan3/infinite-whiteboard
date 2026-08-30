interface StrokeWidthSliderProps {
  value: number;
  onChange: (v: number) => void;
}

export default function StrokeWidthSlider({ value, onChange }: StrokeWidthSliderProps) {
  return (
    <div className="stroke-slider-container">
      <label>Width</label>
      <input
        type="range"
        min={1}
        max={20}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="stroke-slider"
      />
      <span className="stroke-value">{value}</span>
    </div>
  );
}
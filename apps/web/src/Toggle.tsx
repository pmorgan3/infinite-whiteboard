interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export default function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <button
      className={`toggle-btn${value ? ' active' : ''}`}
      onClick={() => onChange(!value)}
    >
      {label}
    </button>
  );
}
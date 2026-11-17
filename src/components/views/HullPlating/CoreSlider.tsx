import React from "react";

interface CoreSliderProps {
  label: string;
  title?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

// Labeled range input for the core. While it is being dragged it shows its
// own value, so updates arriving from the server can't fight the pointer.
const CoreSlider: React.FC<CoreSliderProps> = ({
  label,
  title,
  value,
  min,
  max,
  step,
  format,
  onChange,
}) => {
  const [draft, setDraft] = React.useState<number | null>(null);
  const shown = draft ?? value;
  const release = () => setDraft(null);
  return (
    <label className="core-hullPlating-slider" title={title}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={e => {
          const next = Number(e.target.value);
          setDraft(next);
          onChange(next);
        }}
        onPointerUp={release}
        onKeyUp={release}
        onBlur={release}
      />
      <strong>{format(shown)}</strong>
    </label>
  );
};

export default CoreSlider;

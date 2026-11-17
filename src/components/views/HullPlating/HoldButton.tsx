import React from "react";

interface HoldButtonProps {
  className?: string;
  // Milliseconds the button must be held before onComplete fires
  duration?: number;
  disabled?: boolean;
  onComplete: () => void;
  children: React.ReactNode;
}

// Press-and-hold button: a bar fills while it is held and the action fires
// when it is full. Letting go early cancels. Makes engaging the armor a
// deliberate act rather than a stray tap.
const HoldButton: React.FC<HoldButtonProps> = ({
  className = "",
  duration = 700,
  disabled,
  onComplete,
  children,
}) => {
  const [progress, setProgress] = React.useState(0);
  const frame = React.useRef<number | null>(null);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stop = React.useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setProgress(0);
  }, []);
  React.useEffect(() => stop, [stop]);
  React.useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0 || frame.current !== null) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; pointerup/leave still cancel the hold
    }
    const began = performance.now();
    const step = (now: number) => {
      const value = Math.min(1, (now - began) / duration);
      if (value >= 1) {
        frame.current = null;
        setProgress(0);
        onCompleteRef.current();
        return;
      }
      setProgress(value);
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  return (
    <button
      type="button"
      className={`hull-plating-hold ${
        progress > 0 ? "is-holding" : ""
      } ${className}`}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={e => {
        // Keyboards can't "hold" reliably; Enter / Space act immediately
        if (!disabled && !e.repeat && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onCompleteRef.current();
        }
      }}
    >
      <span
        className="hull-plating-hold-fill"
        style={{transform: `scaleX(${progress})`}}
      />
      <span className="hull-plating-hold-label">{children}</span>
    </button>
  );
};

export default HoldButton;

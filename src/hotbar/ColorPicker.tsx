import { useState, type PointerEvent } from "react";
import { hexToHsv, hsvToHex } from "./color";

export function ColorPicker({
  color,
  onChange,
  onClose,
}: {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
}) {
  const [[hue, saturation, value], setHsv] = useState(() => hexToHsv(color));
  const update = (h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    onChange(hsvToHex(h, s, v));
  };
  const choose = (
    event: PointerEvent<HTMLDivElement>,
    channel: "sv" | "hue",
  ) => {
    if (event.type === "pointerdown") {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (event.clientY - bounds.top) / bounds.height),
    );
    if (channel === "hue") update(Math.min(x * 360, 359.99), saturation, value);
    else update(hue, x, 1 - y);
  };
  const hex = hsvToHex(hue, saturation, value);
  return (
    <section className="color-picker" aria-label="Custom color picker">
      <div className="picker-heading">
        <span>Custom color</span>
        <button onClick={onClose} aria-label="Close color picker">
          Done
        </button>
      </div>
      <div
        className="saturation"
        aria-label="Saturation and brightness"
        style={{ backgroundColor: hsvToHex(hue, 1, 1) }}
        onPointerDown={(e) => choose(e, "sv")}
        onPointerMove={(e) => choose(e, "sv")}
      >
        <span
          className="picker-cursor"
          style={{
            left: `${saturation * 100}%`,
            top: `${(1 - value) * 100}%`,
            background: hex,
          }}
        />
      </div>
      <div
        className="hue"
        aria-label="Hue"
        onPointerDown={(e) => choose(e, "hue")}
        onPointerMove={(e) => choose(e, "hue")}
      >
        <span style={{ left: `${hue / 3.6}%` }} />
      </div>
      <div className="color-value">
        <span style={{ background: hex }} />
        <output>{hex}</output>
      </div>
    </section>
  );
}

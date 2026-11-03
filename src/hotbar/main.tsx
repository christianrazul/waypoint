import {
  StrictMode,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createRoot } from "react-dom/client";
import { commands } from "../shared/ipc";
import { connectDrawingState, runCommand, useAppStore } from "../shared/store";
import { ColorPicker } from "./ColorPicker";
import { Icon, type IconName } from "./Icon";
import "../shared/tokens.css";
import "./styles.css";

const COLORS = [
  { label: "Pink", color: "#F0509A" },
  { label: "Blue", color: "#4FA3F7" },
  { label: "Green", color: "#5BE36A" },
];

function FutureButton({ label, icon }: { label: string; icon?: IconName }) {
  return (
    <span title={`${label} — coming soon`} className="disabled-control">
      <button
        aria-label={label}
        disabled
        className={`icon-button ${label === "Text" ? "text-tool" : ""}`}
      >
        {icon ? <Icon name={icon} /> : "T"}
      </button>
    </span>
  );
}

function Hotbar() {
  const { drawing, ready, error } = useAppStore();
  const [picker, setPicker] = useState(false);
  const [resizing, setResizing] = useState(false);
  const pendingColor = useRef<string | null>(null);
  const sendingColor = useRef(false);
  useEffect(connectDrawingState, []);

  const setColor = (color: string) => {
    pendingColor.current = color;
    if (sendingColor.current) return;
    sendingColor.current = true;
    void runCommand(async () => {
      try {
        while (pendingColor.current) {
          const next = pendingColor.current;
          pendingColor.current = null;
          await commands.setColor(next);
        }
      } finally {
        sendingColor.current = false;
      }
    });
  };
  const changePicker = async (open: boolean) => {
    setResizing(true);
    await runCommand(async () => {
      await commands.setPickerOpen(open);
      setPicker(open);
    });
    setResizing(false);
  };
  const custom = !COLORS.some(({ color }) => color === drawing.color);
  const style = {
    "--current-color": drawing.color,
    "--active-fill": `${drawing.color}2E`,
  } as CSSProperties;

  return (
    <main style={style}>
      <div
        className="hotbar"
        role="toolbar"
        aria-label="Waypoint drawing tools"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="grip"
          data-tauri-drag-region
          title="Drag toolbar"
          aria-label="Drag toolbar"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} data-tauri-drag-region />
          ))}
        </div>
        <div className="button-group" role="group" aria-label="Colors">
          {COLORS.map(({ label, color }) => (
            <button
              key={label}
              className="icon-button color-button"
              aria-label={label}
              aria-pressed={drawing.color === color}
              disabled={!ready}
              onClick={() => {
                setColor(color);
                if (picker) void changePicker(false);
              }}
              title={label}
              style={{ "--swatch": color } as CSSProperties}
            >
              <span className="swatch" />
            </button>
          ))}
          <button
            className="icon-button color-button"
            aria-label="Color wheel"
            aria-expanded={picker}
            aria-pressed={custom}
            disabled={!ready || resizing}
            onClick={() => void changePicker(!picker)}
            title="Custom color"
            style={{ "--swatch": drawing.color } as CSSProperties}
          >
            <span className={`swatch wheel ${custom ? "custom" : ""}`} />
          </button>
          <FutureButton label="Eyedropper" icon="eyedropper" />
        </div>
        <div className="divider" />
        <div className="button-group" role="group" aria-label="Drawing tools">
          <button
            className={`icon-button pen ${drawing.armed ? "active" : ""}`}
            aria-label="Freehand pen"
            aria-pressed={drawing.armed}
            title={
              drawing.armed ? "Turn drawing off (Esc)" : "Draw (Ctrl+Option+D)"
            }
            disabled={!ready}
            onClick={() => void runCommand(commands.togglePen)}
          >
            <Icon name="pen" />
          </button>
          <FutureButton label="Pointer arrow" icon="arrow" />
          <FutureButton label="Rectangle" icon="rectangle" />
          <FutureButton label="Ellipse" icon="ellipse" />
          <FutureButton label="Text" />
        </div>
        <div className="divider" />
        <span
          title="Waypoint sticky — coming soon"
          className="disabled-control"
        >
          <button
            className="sticky-button"
            aria-label="Waypoint sticky"
            disabled
          >
            <Icon name="note" />
            Sticky
          </button>
        </span>
        <FutureButton label="Eraser" icon="eraser" />
        <button
          className="icon-button clear"
          aria-label="Clear all"
          title="Clear all annotations"
          disabled={!ready}
          onClick={() => void runCommand(commands.clearAnnotations)}
        >
          <Icon name="trash" />
        </button>
        <button
          className="close-button"
          aria-label="Close toolbar"
          title="Hide toolbar and turn drawing off"
          onClick={() => void runCommand(commands.closeHotbar)}
        >
          <Icon name="close" />
        </button>
      </div>
      {picker && (
        <ColorPicker
          color={drawing.color}
          onChange={setColor}
          onClose={() => void changePicker(false)}
        />
      )}
      {error && (
        <div className="error" role="alert" title={error}>
          {error}
          <button
            aria-label="Dismiss error"
            onClick={() => useAppStore.setState({ error: null })}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Hotbar />
  </StrictMode>,
);

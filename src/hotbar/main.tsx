import {
  useShortcuts,
  useShortcutStore,
  formatShortcut,
} from "../shared/shortcuts";
import { connectSetupDismissal } from "../shared/setup-dismissal";
import {
  StrictMode,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands } from "../shared/ipc";
import {
  connectAgendaState,
  runAgendaCommand,
  useAgendaStore,
} from "../shared/agenda-store";
import { connectDrawingState, runCommand, useAppStore } from "../shared/store";
import { ColorPicker } from "./ColorPicker";
import type { Features, Tool } from "../shared/types";
import { sampleWebColor, webEyeDropper } from "./eyedropper";
import { Icon, type IconName } from "./Icon";
import "../shared/tokens.css";
import "./styles.css";

const COLORS = [
  { label: "Pink", color: "#F0509A" },
  { label: "Blue", color: "#4FA3F7" },
  { label: "Green", color: "#5BE36A" },
];

const TOOLS: { tool: Tool; label: string; icon?: IconName }[] = [
  { tool: "pen", label: "Freehand pen", icon: "pen" },
  {
    tool: "highlighter",
    label: "Highlighter (hold H and drag)",
    icon: "highlighter",
  },
  { tool: "arrow", label: "Pointer arrow", icon: "arrow" },
  { tool: "rectangle", label: "Rectangle", icon: "rectangle" },
  { tool: "ellipse", label: "Ellipse", icon: "ellipse" },
  { tool: "text", label: "Text" },
];

function Hotbar() {
  const { snapshot: shortcuts, error: shortcutError } = useShortcuts();
  useEffect(connectSetupDismissal, []);
  const { drawing, ready, error: drawingError } = useAppStore();
  const {
    state: agenda,
    ready: agendaReady,
    error: agendaError,
  } = useAgendaStore();
  const error = drawingError ?? agendaError ?? shortcutError ?? shortcuts.error;
  const [features, setFeatures] = useState<Features>({
    nativeEyedropper: false,
    webEyedropper: false,
  });
  const [sampling, setSampling] = useState(false);
  const [picker, setPicker] = useState(false);
  const [resizing, setResizing] = useState(false);
  const pendingColor = useRef<string | null>(null);
  const sendingColor = useRef(false);
  useEffect(connectDrawingState, []);
  useEffect(connectAgendaState, []);
  useEffect(() => {
    let disposed = false;
    void commands
      .getFeatures()
      .then((features) => {
        if (!disposed) {
          setFeatures(features);
          if (features.annotationError) useAppStore.getState().reportError(features.annotationError);
        }
      })
      .catch(useAppStore.getState().reportError);
    return () => {
      disposed = true;
    };
  }, []);
  const busy = sampling || drawing.sampling;
  const pickScreenColor = () => {
    setSampling(true);
    setPicker(false);
    void commands
      .setPickerOpen(false)
      .catch(useAppStore.getState().reportError);
    const action = features.nativeEyedropper
      ? commands.sampleColor()
      : sampleWebColor();
    void runCommand(() => action).finally(() => setSampling(false));
  };

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
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as Element;
          if (target.closest("button, input, select, textarea, a, [role=slider]"))
            return;
          event.preventDefault();
          void getCurrentWindow().startDragging();
        }}
      >
        <div className="button-group" role="group" aria-label="Colors">
          {COLORS.map(({ label, color }) => (
            <button
              key={label}
              className="icon-button color-button"
              aria-label={label}
              aria-pressed={drawing.color === color}
              disabled={!ready || busy}
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
            disabled={!ready || resizing || busy}
            onClick={() => void changePicker(!picker)}
            title="Custom color"
            style={{ "--swatch": drawing.color } as CSSProperties}
          >
            <span className={`swatch wheel ${custom ? "custom" : ""}`} />
          </button>
          {(features.nativeEyedropper ||
            (features.webEyedropper && webEyeDropper())) && (
            <button
              className="icon-button"
              aria-label="Eyedropper"
              title="Pick a screen color"
              disabled={!ready || busy}
              onClick={pickScreenColor}
            >
              <Icon name="eyedropper" />
            </button>
          )}
        </div>
        <div className="divider" />
        <div className="button-group" role="group" aria-label="Drawing tools">
          {TOOLS.map(({ tool, label, icon }) => (
            <button
              key={tool}
              className={`icon-button ${tool === "text" ? "text-tool" : ""} ${drawing.armed && drawing.tool === tool ? "active" : ""}`}
              aria-label={label}
              aria-pressed={drawing.armed && drawing.tool === tool}
              title={
                drawing.armed && drawing.tool === tool
                  ? "Turn drawing off (Esc)"
                  : label
              }
              disabled={!ready || busy}
              onClick={() => void runCommand(() => commands.selectTool(tool))}
            >
              {icon ? <Icon name={icon} /> : "T"}
            </button>
          ))}
        </div>
        <div className="divider" />
        <button
          className="sticky-button"
          aria-label="Waypoint sticky"
          aria-pressed={agenda?.settings.enabled ?? false}
          title={`Toggle agenda sticky (${formatShortcut(shortcuts.bindings.toggleSticky)}) · Alt-click to set up`}
          disabled={!agendaReady || busy}
          onClick={(event) => {
            if (event.altKey)
              void commands
                .openSetup()
                .catch((error) => useAgendaStore.getState().reportError(error));
            else void runAgendaCommand(commands.toggleSticky);
          }}
        >
          <Icon name="note" />
        </button>
        <button
          className={`icon-button ${drawing.armed && drawing.tool === "eraser" ? "active" : ""}`}
          aria-label="Eraser"
          aria-pressed={drawing.armed && drawing.tool === "eraser"}
          title="Erase whole objects"
          disabled={!ready || busy}
          onClick={() => void runCommand(() => commands.selectTool("eraser"))}
        >
          <Icon name="eraser" />
        </button>
        <button
          className="icon-button clear"
          aria-label="Clear all"
          title="Clear all annotations"
          disabled={!ready || busy}
          onClick={() => void runCommand(commands.clearAnnotations)}
        >
          <Icon name="trash" />
        </button>
        <button
          className="close-button"
          aria-label="Close toolbar"
          title="Hide toolbar and turn drawing off"
          disabled={busy}
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
            onClick={() => {
              useAppStore.setState({ error: null });
              useAgendaStore.setState({ error: null });
              useShortcutStore.setState((current) => ({
                error: null,
                snapshot: { ...current.snapshot, error: null },
              }));
            }}
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

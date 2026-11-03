import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { commands, on, type SpikeState } from "../shared/ipc";
import "../shared/tokens.css";

// M0 test panel: a stand-in for the hotbar that must stay clickable without taking focus.
// "Frontmost app" should keep showing Keynote / PowerPoint / Chrome while you click here,
// and the key counter should stay at 0 while you press arrow keys to advance slides.

const LEVEL_LABEL: Record<SpikeState["level"], string> = {
  status: "Status (25)",
  popUpMenu: "Pop-up menu (101)",
  screenSaver: "Screen saver (1000)",
  shielding: "Shielding",
};

function Spike() {
  const [state, setState] = useState<SpikeState | null>(null);
  const [clicks, setClicks] = useState(0);
  const [keys, setKeys] = useState(0);

  const refresh = () => commands.getSpikeState().then(setState);

  useEffect(() => {
    refresh();
    // Polling is spike-only: it shows which app owns keyboard focus right now.
    const timer = window.setInterval(refresh, 500);
    const onKey = () => setKeys((n) => n + 1);
    window.addEventListener("keydown", onKey);
    const unlisteners = [on("overlay:armed", refresh), on("spike:level", refresh)];
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey);
      unlisteners.forEach((p) => p.then((off) => off()));
    };
  }, []);

  const click = () => {
    const next = clicks + 1;
    setClicks(next);
    commands.spikePing(next);
  };

  const toggle = () => {
    if (state) commands.setClickThrough(!state.clickThrough).then(refresh);
  };

  return (
    <div style={styles.panel}>
      <div data-tauri-drag-region style={styles.header}>
        <span data-tauri-drag-region style={styles.grip}>⠿</span>
        <span data-tauri-drag-region>{state?.appName ?? "Waypoint"} · M0 spike</span>
      </div>
      <Row label="Frontmost app" value={state?.frontmostApp ?? "…"} />
      <Row label="Overlay" value={state?.clickThrough ? "pass-through" : "armed (drawing)"} />
      <Row label="Window level" value={state ? LEVEL_LABEL[state.level] : "…"} />
      <Row label="Clicks here / keys here" value={`${clicks} / ${keys}`} />
      <div style={styles.buttons}>
        <button style={{ ...styles.button, background: "var(--wp-accent)", color: "#111" }} onClick={click}>
          Click me
        </button>
        <button style={styles.button} onClick={toggle}>
          {state?.clickThrough ? "Arm drawing" : "Pass-through"}
        </button>
      </div>
      <p style={styles.hint}>Drag the header to move. ⌃⌥D toggles drawing. Tray menu changes the level.</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={{ color: "#9CA3AF" }}>{label}</span>
      <span style={{ color: "#F2F4F7", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    margin: 8,
    padding: "10px 14px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "var(--wp-bar-bg)",
    border: "1px solid var(--wp-bar-border)",
    borderRadius: "var(--wp-bar-radius)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    color: "#fff",
    fontSize: 13,
  },
  header: { display: "flex", alignItems: "center", gap: 8, fontWeight: 600, cursor: "grab", height: 24 },
  grip: { color: "#6B7280", fontSize: 16 },
  row: { display: "flex", justifyContent: "space-between", gap: 12 },
  buttons: { display: "flex", gap: 8, marginTop: 4 },
  button: {
    flex: 1,
    height: 44,
    border: 0,
    borderRadius: "var(--wp-button-radius)",
    background: "var(--wp-close-bg)",
    color: "var(--wp-icon-idle)",
    font: "600 13px var(--wp-font)",
    cursor: "pointer",
  },
  hint: { margin: 0, fontSize: 11, color: "#9CA3AF" },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Spike />
  </StrictMode>,
);

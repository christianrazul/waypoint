import { commands } from "./ipc";

export function connectSetupDismissal(): () => void {
  const outside = () => {
    void commands
      .requestSetupClose()
      .catch((error) => console.error("Could not dismiss sticky setup", error));
  };
  document.addEventListener("pointerdown", outside, true);
  return () => document.removeEventListener("pointerdown", outside, true);
}

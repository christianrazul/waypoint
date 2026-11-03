import { expect, it } from "vitest";
import { captureShortcut, formatShortcut } from "./shortcuts";
it("captures physical letter keys with modifier order independent of keyboard text", () => {
  expect(
    captureShortcut({
      code: "KeyD",
      ctrlKey: true,
      altKey: true,
      metaKey: false,
      shiftKey: false,
    }),
  ).toBe("ctrl+alt+KeyD");
  expect(
    captureShortcut({
      code: "ArrowRight",
      ctrlKey: false,
      altKey: false,
      metaKey: true,
      shiftKey: true,
    }),
  ).toBe("super+shift+ArrowRight");
  expect(
    captureShortcut({
      code: "AltLeft",
      ctrlKey: false,
      altKey: true,
      metaKey: false,
      shiftKey: false,
    }),
  ).toBeNull();
});
it("shows platform labels without stale default hints", () => {
  expect(formatShortcut("control+alt+KeyX", true)).toBe("Ctrl+Option+X");
  expect(formatShortcut("control+alt+ArrowRight", false)).toBe(
    "Ctrl+Alt+Right",
  );
  expect(formatShortcut("super+shift+Digit2", true)).toBe("Cmd+Shift+2");
});

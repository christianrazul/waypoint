import { beforeEach, expect, it, vi } from "vitest";
const ipc = vi.hoisted(() => ({
  beginSampling: vi.fn(),
  endSampling: vi.fn(),
  setColor: vi.fn(),
}));
vi.mock("../shared/ipc", () => ({ commands: ipc }));
import { sampleWebColor } from "./eyedropper";
let open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  open = vi.fn();
  ipc.beginSampling.mockResolvedValue(undefined);
  ipc.endSampling.mockResolvedValue(undefined);
  ipc.setColor.mockResolvedValue(undefined);
  vi.stubGlobal("window", {
    EyeDropper: class {
      open = open;
    },
  });
});
it("opens synchronously within the click activation and restores drawing after selection", async () => {
  const calls: string[] = [];
  open.mockImplementation(() => {
    calls.push("open");
    return Promise.resolve({ sRGBHex: "#123456" });
  });
  ipc.beginSampling.mockImplementation(async () => {
    calls.push("begin");
  });
  await sampleWebColor();
  expect(calls).toEqual(["open", "begin"]);
  expect(ipc.setColor).toHaveBeenCalledWith("#123456");
  expect(ipc.endSampling).toHaveBeenCalledOnce();
});
it("treats cancellation as a no-op and restores drawing", async () => {
  open.mockRejectedValue(new DOMException("cancelled", "AbortError"));
  await expect(sampleWebColor()).resolves.toBeUndefined();
  expect(ipc.setColor).not.toHaveBeenCalled();
  expect(ipc.endSampling).toHaveBeenCalledOnce();
});
it("aborts the browser sampler if native setup fails", async () => {
  let signal: AbortSignal;
  open.mockImplementation((options: { signal: AbortSignal }) => {
    signal = options.signal;
    return Promise.resolve({ sRGBHex: "#123456" });
  });
  ipc.beginSampling.mockRejectedValueOnce(new Error("shortcut conflict"));
  await expect(sampleWebColor()).rejects.toThrow("shortcut conflict");
  expect(signal!.aborted).toBe(true);
  expect(ipc.endSampling).not.toHaveBeenCalled();
});
it("releases sampling state when a browser operation fails", async () => {
  open.mockRejectedValue(new Error("sampling failed"));
  await expect(sampleWebColor()).rejects.toThrow("sampling failed");
  expect(ipc.endSampling).toHaveBeenCalledOnce();
});

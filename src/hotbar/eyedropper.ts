import { commands } from "../shared/ipc";

interface EyeDropper {
  open: (options?: { signal: AbortSignal }) => Promise<{ sRGBHex: string }>;
}
export function webEyeDropper(): (new () => EyeDropper) | undefined {
  return (window as Window & { EyeDropper?: new () => EyeDropper }).EyeDropper;
}

export async function sampleWebColor(): Promise<void> {
  const EyeDropper = webEyeDropper();
  if (!EyeDropper)
    throw new Error("Screen color sampling is unavailable in this webview");
  const abort = new AbortController();
  const selected = new EyeDropper().open({ signal: abort.signal }).then(
    (result) => ({ result, error: null }),
    (error: unknown) => ({ result: null, error }),
  );
  let started = false;
  try {
    await commands.beginSampling();
    started = true;
    const { result, error } = await selected;
    if (result) await commands.setColor(result.sRGBHex);
    else if (!(error instanceof DOMException && error.name === "AbortError"))
      throw error;
  } finally {
    abort.abort();
    if (started) await commands.endSampling();
  }
}

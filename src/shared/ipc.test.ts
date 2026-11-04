import { beforeEach, expect, it, vi } from "vitest";
import type { EventTarget, Options } from "@tauri-apps/api/event";

const transport = vi.hoisted(() => ({
  label: "overlay-0",
  registrations: [] as {
    event: string;
    target: EventTarget;
    handler: (event: { payload: unknown }) => void;
  }[],
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: transport.label }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    event: string,
    handler: (event: { payload: unknown }) => void,
    options?: Options,
  ) => {
    const registration = {
      event,
      handler,
      target: (options?.target ?? { kind: "Any" }) as EventTarget,
    };
    transport.registrations.push(registration);
    return () => {
      transport.registrations.splice(
        transport.registrations.indexOf(registration), 1,
      );
    };
  },
}));

import { on } from "./ipc";

function emitTo(label: string, event: string, payload: unknown = null) {
  for (const registration of transport.registrations) {
    const target = registration.target;
    if (registration.event === event &&
      (target.kind === "Any" || ("label" in target && target.label === label))) {
      registration.handler({ payload });
    }
  }
}

beforeEach(() => {
  transport.label = "overlay-0";
  transport.registrations.length = 0;
});

it.each([
  "annotations:undo", "annotations:redo", "annotations:clear", "text:commit",
  "overlay:session-changed",
] as const)("delivers %s only to the addressed overlay", async (event) => {
  const first = vi.fn();
  const second = vi.fn();
  await on(event, first);
  transport.label = "overlay-1";
  const off = await on(event, second);

  emitTo("overlay-1", event);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledExactlyOnceWith(null);
  emitTo("overlay-0", event);
  expect(first).toHaveBeenCalledExactlyOnceWith(null);
  expect(second).toHaveBeenCalledTimes(1);

  off();
  emitTo("overlay-1", event);
  expect(second).toHaveBeenCalledTimes(1);
});

it.each(["tool:changed", "color:changed"] as const)(
  "keeps %s listeners global across overlays", async (event) => {
    await on(event, vi.fn());
    transport.label = "overlay-1";
    await on(event, vi.fn());
    expect(transport.registrations.map(({ target }) => target)).toEqual([
      { kind: "Any" }, { kind: "Any" },
    ]);
  },
);

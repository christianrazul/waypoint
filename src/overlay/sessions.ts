import type { HistorySnapshot } from "./history";

interface Transport {
  get: () => Promise<{ generation: number; snapshot: HistorySnapshot | null }>;
  save: (generation: number, snapshot: HistorySnapshot) => Promise<void>;
  ready: (generation: number) => Promise<boolean>;
}
interface Surface {
  finish: () => void;
  snapshot: () => HistorySnapshot;
  restore: (snapshot: HistorySnapshot) => void;
  ready: (ready: boolean) => void;
  error: (error: unknown) => void;
}

export class OverlaySessions {
  private generation: number | null = null;
  private request = 0;
  private disposed = false;
  private writes: Promise<void> = Promise.resolve();
  constructor(private transport: Transport, private surface: Surface) {}

  save = (): Promise<void> => {
    if (this.disposed || this.generation === null) return this.writes;
    const generation = this.generation;
    const snapshot = this.surface.snapshot();
    this.writes = this.writes.catch(() => {}).then(() =>
      this.transport.save(generation, snapshot),
    );
    return this.writes;
  };

  refresh = async (): Promise<void> => {
    if (this.disposed) return;
    const request = ++this.request;
    this.surface.ready(false);
    this.surface.finish();
    try {
      await this.save();
      const session = await this.transport.get();
      if (this.disposed || request !== this.request) return;
      this.generation = session.generation;
      this.surface.restore(session.snapshot ?? { objects: [], past: [], future: [] });
      const accepted = await this.transport.ready(session.generation);
      if (this.disposed || request !== this.request) return;
      if (accepted) this.surface.ready(true);
      else await this.refresh();
    } catch (error) {
      if (!this.disposed && request === this.request) this.surface.error(error);
    }
  };

  dispose(): void { this.disposed = true; }
}

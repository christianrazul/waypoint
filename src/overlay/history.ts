import type { Annotation } from "../shared/types";

type Entry = { index: number; object: Annotation };
type Change = { added: Entry[]; removed: Entry[] };
export interface HistorySnapshot {
  objects: Annotation[];
  past: Change[];
  future: Change[];
}

export class AnnotationHistory {
  onChange: (() => void) | null = null;
  snapshot(): HistorySnapshot {
    return {
      objects: [...this.objects],
      past: [...this.past],
      future: [...this.future],
    };
  }
  restore(snapshot: HistorySnapshot): void {
    this.objects = snapshot.objects;
    this.past = snapshot.past;
    this.future = snapshot.future;
  }
  private objects: Annotation[] = [];
  private past: Change[] = [];
  private future: Change[] = [];

  get annotations(): readonly Annotation[] {
    return this.objects;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  add(object: Annotation): void {
    this.commit({
      added: [{ index: this.objects.length, object }],
      removed: [],
    });
  }

  remove(ids: ReadonlySet<string>): void {
    const removed = this.objects.flatMap((object, index) =>
      ids.has(object.id) ? [{ index, object }] : [],
    );
    if (removed.length) this.commit({ added: [], removed });
  }

  clear(): void {
    this.remove(new Set(this.objects.map((object) => object.id)));
  }

  undo(): void {
    const change = this.past.pop();
    if (!change) return;
    this.apply({ added: change.removed, removed: change.added });
    this.future.push(change);
    this.onChange?.();
  }

  redo(): void {
    const change = this.future.pop();
    if (!change) return;
    this.apply(change);
    this.past.push(change);
    this.onChange?.();
  }

  private commit(change: Change): void {
    this.apply(change);
    this.past.push(change);
    this.future = [];
    this.onChange?.();
  }

  private apply(change: Change): void {
    const removed = new Set(change.removed.map(({ object }) => object.id));
    this.objects = this.objects.filter((object) => !removed.has(object.id));
    for (const { object, index } of [...change.added].sort(
      (a, b) => a.index - b.index,
    )) {
      this.objects.splice(index, 0, object);
    }
  }
}

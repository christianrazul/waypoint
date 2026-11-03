import type { Annotation } from "../shared/types";

type Entry = { index: number; object: Annotation };
type Change = { added: Entry[]; removed: Entry[] };

export class AnnotationHistory {
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
  }

  redo(): void {
    const change = this.future.pop();
    if (!change) return;
    this.apply(change);
    this.past.push(change);
  }

  private commit(change: Change): void {
    this.apply(change);
    this.past.push(change);
    this.future = [];
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

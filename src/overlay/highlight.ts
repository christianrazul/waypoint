/** How long each part of a highlight stays on screen after it was drawn. */
export const HIGHLIGHT_LIFETIME = 2500;
export const HIGHLIGHT_WIDTH = 22;
/** Translucent, like a real highlighter: whatever is underneath stays readable. */
export const HIGHLIGHT_ALPHA = 0.4;

export type TimedPoint = [x: number, y: number, time: number];

export interface Highlight {
  color: string;
  points: TimedPoint[];
  /** The pointer is up; the trail is dropped once it has faded completely. */
  done: boolean;
}

/**
 * Removes the part of a trail drawn before `cutoff`, oldest first, so the highlight recedes from
 * where it started. The new tail is interpolated so it moves smoothly instead of in point steps.
 */
export function trimTrail(points: TimedPoint[], cutoff: number): void {
  let expired = 0;
  while (expired < points.length && points[expired][2] <= cutoff) expired++;
  if (expired === 0) return;
  if (expired === points.length) {
    points.length = 0;
    return;
  }
  const [x0, y0, t0] = points[expired - 1];
  const [x1, y1, t1] = points[expired];
  const f = (cutoff - t0) / (t1 - t0);
  points.splice(0, expired - 1);
  points[0] = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, cutoff];
}

/** Draws fading highlights on their own canvas so the annotation canvas is not redrawn per frame. */
export class HighlightLayer {
  private trails: Highlight[] = [];
  private frame: number | null = null;
  private ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private now: () => number = () => performance.now(),
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is unavailable");
    this.ctx = ctx;
  }

  start(color: string, x: number, y: number): Highlight {
    const trail: Highlight = { color, points: [[x, y, this.now()]], done: false };
    this.trails.push(trail);
    this.request();
    return trail;
  }

  extend(trail: Highlight, x: number, y: number): void {
    const time = this.now();
    const last = trail.points.at(-1);
    if (last && last[0] === x && last[1] === y) return;
    // Equal timestamps would make the tail interpolation divide by zero.
    trail.points.push([x, y, last && time <= last[2] ? last[2] + 0.001 : time]);
    this.request();
  }

  end(trail: Highlight): void {
    trail.done = true;
  }

  clear(): void {
    this.trails = [];
    this.request();
  }

  resize(): void {
    this.canvas.width = Math.round(window.innerWidth * window.devicePixelRatio);
    this.canvas.height = Math.round(window.innerHeight * window.devicePixelRatio);
    this.request();
  }

  dispose(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.trails = [];
  }

  private request(): void {
    if (this.frame === null) this.frame = requestAnimationFrame(this.draw);
  }

  private draw = (): void => {
    this.frame = null;
    const cutoff = this.now() - HIGHLIGHT_LIFETIME;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const dpr = window.devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = HIGHLIGHT_ALPHA;
    ctx.lineWidth = HIGHLIGHT_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let visible = false;
    this.trails = this.trails.filter((trail) => {
      trimTrail(trail.points, cutoff);
      if (trail.points.length === 0) return !trail.done;
      visible = true;
      drawTrail(ctx, trail);
      return true;
    });
    // Keep animating only while something is still fading out.
    if (visible) this.request();
  };
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: Highlight): void {
  const points = trail.points;
  ctx.strokeStyle = trail.color;
  ctx.fillStyle = trail.color;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0], points[0][1], HIGHLIGHT_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // One stroke per trail, so a highlight crossing itself does not darken.
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nextX, nextY] = points[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
  }
  const [x, y] = points[points.length - 1];
  ctx.lineTo(x, y);
  ctx.stroke();
}

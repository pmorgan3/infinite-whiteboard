import type { Point, ViewportState } from './types';

export class Viewport {
  x = 0;
  y = 0;
  zoom = 1;

  constructor(state?: Partial<ViewportState>) {
    if (state) {
      this.x = state.x ?? 0;
      this.y = state.y ?? 0;
      this.zoom = state.zoom ?? 1;
    }
  }

  clone(): Viewport {
    return new Viewport({ x: this.x, y: this.y, zoom: this.zoom });
  }

  toState(): ViewportState {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  screenToWorld(point: Point, width: number, height: number): Point {
    return {
      x: (point.x - width / 2 - this.x) / this.zoom,
      y: (point.y - height / 2 - this.y) / this.zoom,
    };
  }

  worldToScreen(point: Point, width: number, height: number): Point {
    return {
      x: point.x * this.zoom + width / 2 + this.x,
      y: point.y * this.zoom + height / 2 + this.y,
    };
  }

  zoomToPoint(screenX: number, screenY: number, newZoom: number, canvasWidth: number, canvasHeight: number): void {
    const worldBefore = this.screenToWorld({ x: screenX, y: screenY }, canvasWidth, canvasHeight);
    this.zoom = Math.max(0.05, Math.min(10, newZoom));
    const worldAfter = this.screenToWorld({ x: screenX, y: screenY }, canvasWidth, canvasHeight);
    this.x += (worldAfter.x - worldBefore.x) * this.zoom;
    this.y += (worldAfter.y - worldBefore.y) * this.zoom;
  }
}

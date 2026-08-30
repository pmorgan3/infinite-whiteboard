import type { Point, WBElement, ToolType, SnapConfig, SnapGuides, AnchorPosition, ArrowBinding, GroupElement } from './types';
import { Viewport } from './viewport';
import { getElementBounds, shiftBounds, snapToGuides, getAnchorPoint } from './snap';

export interface ToolContext {
  viewport: Viewport;
  elements: WBElement[];
  addElement: (el: WBElement) => void;
  updateElement: (id: string, updater: (el: WBElement) => WBElement) => void;
  deleteElements: (ids: string[]) => void;
  getSelectedIds: () => Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  canvasWidth: number;
  canvasHeight: number;
  scheduleRender: () => void;
  getOffset(e: PointerEvent): Point;
  activeColor: string;
  startEditing: (elementId: string) => void;
  requestImageUpload: (point: Point) => void;
  snapConfig: SnapConfig;
  snapToGrid(point: Point): Point;
  setGuides(guides: SnapGuides | null): void;
  resolveBindings: () => void;
  setArrowSnapTarget(id: string | null): void;
}

export interface Tool {
  onPointerDown(e: PointerEvent, ctx: ToolContext): void;
  onPointerMove(e: PointerEvent, ctx: ToolContext): void;
  onPointerUp(e: PointerEvent, ctx: ToolContext): void;
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): void;
}

export interface ToolOptions {
  color: string;
  strokeWidth: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
}

export function createTool(type: ToolType, options: ToolOptions): Tool {
  switch (type) {
    case 'pan':
      return new PanTool();
    case 'draw':
      return new DrawTool(options.color, options.strokeWidth);
    case 'rectangle':
      return new RectangleTool(options.color, options.strokeWidth);
    case 'ellipse':
      return new EllipseTool(options.color, options.strokeWidth);
    case 'select':
      return new SelectTool();
    case 'text':
      return new TextTool();
    case 'sticky':
      return new StickyTool();
    case 'image':
      return new ImageTool();
    case 'arrow':
      return new ArrowTool(options.color, options.strokeWidth, options.arrowStart ?? false, options.arrowEnd ?? true);
    default:
      return new PanTool();
  }
}

class PanTool implements Tool {
  private isPanning = false;
  private lastPoint: Point | null = null;

  onPointerDown(e: PointerEvent, _ctx: ToolContext) {
    if (e.button === 0 || e.button === 1) {
      this.isPanning = true;
      this.lastPoint = { x: e.clientX, y: e.clientY };
    }
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isPanning || !this.lastPoint) return;
    const dx = e.clientX - this.lastPoint.x;
    const dy = e.clientY - this.lastPoint.y;
    ctx.viewport.x += dx;
    ctx.viewport.y += dy;
    this.lastPoint = { x: e.clientX, y: e.clientY };
    ctx.scheduleRender();
  }

  onPointerUp(_e: PointerEvent, _ctx: ToolContext) {
    this.isPanning = false;
    this.lastPoint = null;
  }
}

class DrawTool implements Tool {
  private currentPath: Point[] = [];
  private isDrawing = false;

  constructor(private color: string, private strokeWidth: number) {}

  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    const off = ctx.getOffset(e);
    const world = ctx.viewport.screenToWorld(
      off,
      ctx.canvasWidth,
      ctx.canvasHeight
    );
    this.currentPath = [world];
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing) return;
    const off = ctx.getOffset(e);
    const world = ctx.viewport.screenToWorld(
      off,
      ctx.canvasWidth,
      ctx.canvasHeight
    );
    this.currentPath.push(world);
    ctx.scheduleRender();
  }

  onPointerUp(_e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || this.currentPath.length < 2) {
      this.isDrawing = false;
      this.currentPath = [];
      return;
    }
    ctx.addElement({
      id: generateId(),
      type: 'path',
      points: [...this.currentPath],
      color: this.color,
      strokeWidth: this.strokeWidth,
    });
    this.isDrawing = false;
    this.currentPath = [];
  }

  getPreview(): Point[] {
    return this.currentPath;
  }
}

class RectangleTool implements Tool {
  private start: Point | null = null;
  private end: Point | null = null;
  private isDrawing = false;

  constructor(private color: string, private strokeWidth: number) {}

  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    world = ctx.snapToGrid(world);
    this.start = world;
    this.end = world;
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start) return;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    world = ctx.snapToGrid(world);
    this.end = world;
    ctx.scheduleRender();
  }

  onPointerUp(_e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start || !this.end) {
      this.isDrawing = false;
      this.start = null;
      this.end = null;
      return;
    }
    const x = Math.min(this.start.x, this.end.x);
    const y = Math.min(this.start.y, this.end.y);
    const width = Math.abs(this.end.x - this.start.x);
    const height = Math.abs(this.end.y - this.start.y);
    if (width > 2 && height > 2) {
      ctx.addElement({
        id: generateId(),
        type: 'rectangle',
        x,
        y,
        width,
        height,
        color: this.color,
        strokeWidth: this.strokeWidth,
      });
    }
    this.isDrawing = false;
    this.start = null;
    this.end = null;
  }

  getPreview(): { start: Point; end: Point } | null {
    if (!this.isDrawing || !this.start || !this.end) return null;
    return { start: this.start, end: this.end };
  }
}

class EllipseTool implements Tool {
  private start: Point | null = null;
  private end: Point | null = null;
  private isDrawing = false;

  constructor(private color: string, private strokeWidth: number) {}

  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    world = ctx.snapToGrid(world);
    this.start = world;
    this.end = world;
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start) return;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    world = ctx.snapToGrid(world);
    this.end = world;
    ctx.scheduleRender();
  }

  onPointerUp(_e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start || !this.end) {
      this.isDrawing = false;
      this.start = null;
      this.end = null;
      return;
    }
    const x = (this.start.x + this.end.x) / 2;
    const y = (this.start.y + this.end.y) / 2;
    const rx = Math.abs(this.end.x - this.start.x) / 2;
    const ry = Math.abs(this.end.y - this.start.y) / 2;
    if (rx > 2 && ry > 2) {
      ctx.addElement({
        id: generateId(),
        type: 'ellipse',
        x,
        y,
        rx,
        ry,
        color: this.color,
        strokeWidth: this.strokeWidth,
      });
    }
    this.isDrawing = false;
    this.start = null;
    this.end = null;
  }

  getPreview(): { start: Point; end: Point } | null {
    if (!this.isDrawing || !this.start || !this.end) return null;
    return { start: this.start, end: this.end };
  }
}

class TextTool implements Tool {
  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    const off = ctx.getOffset(e);
    const world = ctx.viewport.screenToWorld(
      off,
      ctx.canvasWidth,
      ctx.canvasHeight
    );

    const clicked = [...ctx.elements].reverse().find(
      (el) => el.type === 'text' && hitTest(el, world)
    );

    if (clicked) {
      ctx.setSelectedIds(new Set([clicked.id]));
      ctx.startEditing(clicked.id);
    } else {
      const id = generateId();
      ctx.addElement({
        id,
        type: 'text',
        x: world.x,
        y: world.y,
        width: 200,
        height: 40,
        text: '',
        fontSize: 16,
        fontFamily: 'sans-serif',
        fill: 'transparent',
        color: ctx.activeColor,
        strokeWidth: 1,
      });
      ctx.setSelectedIds(new Set([id]));
      ctx.startEditing(id);
    }
  }

  onPointerMove() {}
  onPointerUp() {}
}

export class StickyTool implements Tool {
  private start: Point | null = null;
  private end: Point | null = null;

  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    const off = ctx.getOffset(e);
    const world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    const clicked = [...ctx.elements].reverse().find(el => el.type === 'sticky' && hitTest(el, world));
    if (clicked) {
      ctx.setSelectedIds(new Set([clicked.id]));
      ctx.startEditing(clicked.id);
      return;
    }
    this.start = world;
    this.end = world;
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.start) return;
    const off = ctx.getOffset(e);
    this.end = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
  }

  onPointerUp(_e: PointerEvent, ctx: ToolContext) {
    if (!this.start || !this.end) return;
    const dragged = Math.hypot(this.end.x - this.start.x, this.end.y - this.start.y) > 5;
    const width = dragged ? Math.max(120, Math.abs(this.end.x - this.start.x)) : 220;
    const height = dragged ? Math.max(96, Math.abs(this.end.y - this.start.y)) : 160;
    const x = dragged ? Math.min(this.start.x, this.end.x) : this.start.x - width / 2;
    const y = dragged ? Math.min(this.start.y, this.end.y) : this.start.y - height / 2;
    const id = generateId();
    ctx.addElement({
      id, type: 'sticky', x, y, width, height, text: '', fill: '#fef08a',
      fontSize: 16, fontFamily: 'sans-serif', textAlign: 'left',
      fontWeight: 'normal', fontStyle: 'normal', color: '#1f2937', strokeWidth: 0,
    });
    ctx.setSelectedIds(new Set([id]));
    ctx.startEditing(id);
    this.start = null;
    this.end = null;
  }
}

class ImageTool implements Tool {
  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    const off = ctx.getOffset(e);
    const world = ctx.viewport.screenToWorld(
      off,
      ctx.canvasWidth,
      ctx.canvasHeight
    );
    ctx.requestImageUpload(world);
  }

  onPointerMove() {}
  onPointerUp() {}
}

class ArrowTool implements Tool {
  private start: Point | null = null;
  private end: Point | null = null;
  private isDrawing = false;
  private startBinding: ArrowBinding | null = null;
  private endBinding: ArrowBinding | null = null;
  private snapThreshold = 12;
  private hoveredElementId: string | null = null;

  constructor(
    private color: string,
    private strokeWidth: number,
    private arrowStart: boolean,
    private arrowEnd: boolean,
  ) {}

  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    world = ctx.snapToGrid(world);

    const snapResult = this.snapToPoint(world, ctx.elements, ctx.viewport);
    world = snapResult.point;
    this.startBinding = snapResult.binding;

    this.start = world;
    this.end = world;
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start) return;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    world = ctx.snapToGrid(world);

    const snapResult = this.snapToPoint(world, ctx.elements, ctx.viewport);
    if (!snapResult.binding || snapResult.binding.elementId !== this.startBinding?.elementId) {
      world = snapResult.point;
      this.endBinding = snapResult.binding;
      this.hoveredElementId = snapResult.binding?.elementId ?? null;
    }
    ctx.setArrowSnapTarget(this.hoveredElementId);

    this.end = world;
    ctx.scheduleRender();
  }

  onPointerUp(_e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start || !this.end) {
      this.reset(ctx);
      return;
    }
    const dx = this.end.x - this.start.x;
    const dy = this.end.y - this.start.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      ctx.addElement({
        id: generateId(),
        type: 'arrow',
        startX: this.start.x,
        startY: this.start.y,
        endX: this.end.x,
        endY: this.end.y,
        startArrowhead: this.arrowStart,
        endArrowhead: this.arrowEnd,
        color: this.color,
        strokeWidth: this.strokeWidth,
        startBinding: this.startBinding,
        endBinding: this.endBinding,
      });
    }
    this.reset(ctx);
  }

  getPreview(): { start: Point; end: Point } | null {
    if (!this.isDrawing || !this.start || !this.end) return null;
    return { start: this.start, end: this.end };
  }

  getHoveredElementId(): string | null {
    return this.hoveredElementId;
  }

  private snapToPoint(point: Point, elements: WBElement[], viewport: Viewport): { point: Point; binding: ArrowBinding | null } {
    let closestDist = this.snapThreshold / viewport.zoom * 2;
    let closestPoint = point;
    let closestBinding: ArrowBinding | null = null;

    const positions: AnchorPosition[] = ['top', 'right', 'bottom', 'left', 'center'];

    for (const el of elements) {
      if (el.type === 'arrow' || el.type === 'path') continue;

      for (const pos of positions) {
        const anchor = getAnchorPoint(el, pos);
        const dist = Math.hypot(point.x - anchor.x, point.y - anchor.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestPoint = anchor;
          closestBinding = { elementId: el.id, position: pos };
        }
      }
    }

    return { point: closestPoint, binding: closestBinding };
  }

  private reset(ctx: ToolContext) {
    this.isDrawing = false;
    this.start = null;
    this.end = null;
    this.startBinding = null;
    this.endBinding = null;
    this.hoveredElementId = null;
    ctx.setArrowSnapTarget(null);
  }
}

class SelectTool implements Tool {
  private isDragging = false;
  private dragStart: Point | null = null;
  private dragOffset: Map<string, Point> = new Map();
  private guides: SnapGuides | null = null;

  private findParentGroup(groupMemberId: string, elements: WBElement[]): GroupElement | null {
    for (const el of elements) {
      if (el.type === 'group' && (el as GroupElement).memberIds.includes(groupMemberId)) {
        return el as GroupElement;
      }
    }
    return null;
  }

  private expandGroupMembers(ids: Set<string>, elements: WBElement[]): string[] {
    const result: string[] = [];
    for (const id of ids) {
      const el = elements.find(e => e.id === id);
      if (el?.type === 'group') {
        for (const mid of (el as GroupElement).memberIds) {
          if (!result.includes(mid)) result.push(mid);
        }
      } else {
        if (!result.includes(id)) result.push(id);
      }
    }
    return result;
  }

  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    const off = ctx.getOffset(e);
    const world = ctx.viewport.screenToWorld(
      off,
      ctx.canvasWidth,
      ctx.canvasHeight
    );

    // Search non-group elements first (reverse order for top-most)
    const clicked = [...ctx.elements].reverse().find((el) =>
      el.type !== 'group' && hitTest(el, world)
    );

    if (clicked) {
      const parentGroup = this.findParentGroup(clicked.id, ctx.elements);
      if (parentGroup && !e.shiftKey) {
        ctx.setSelectedIds(new Set([parentGroup.id]));
      } else {
        const selected = ctx.getSelectedIds();
        if (e.shiftKey) {
          const next = new Set(selected);
          if (next.has(clicked.id)) {
            next.delete(clicked.id);
          } else {
            next.add(clicked.id);
          }
          ctx.setSelectedIds(next);
        } else if (!selected.has(clicked.id)) {
          ctx.setSelectedIds(new Set([clicked.id]));
        }
      }

      this.isDragging = true;
      this.dragStart = world;
      const expanded = this.expandGroupMembers(ctx.getSelectedIds(), ctx.elements);
      for (const id of expanded) {
        const el = ctx.elements.find((e) => e.id === id);
        if (el) this.dragOffset.set(id, getElementPos(el));
      }
    } else {
      // Check group elements (lower priority)
      const groupClicked = [...ctx.elements].reverse().find(
        el => el.type === 'group' && hitTest(el, world)
      );
      if (groupClicked) {
        ctx.setSelectedIds(new Set([groupClicked.id]));
        this.isDragging = true;
        this.dragStart = world;
        const expanded = this.expandGroupMembers(ctx.getSelectedIds(), ctx.elements);
        for (const id of expanded) {
          const el = ctx.elements.find((e) => e.id === id);
          if (el) this.dragOffset.set(id, getElementPos(el));
        }
      } else {
        if (!e.shiftKey) {
          ctx.setSelectedIds(new Set());
        }
      }
    }
    ctx.scheduleRender();
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isDragging || !this.dragStart) return;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    world = ctx.snapToGrid(world);
    let dx = world.x - this.dragStart.x;
    let dy = world.y - this.dragStart.y;

    const primaryId = ctx.getSelectedIds().values().next().value;
    if (primaryId && ctx.snapConfig.enabled) {
      const primaryEl = ctx.elements.find(el => el.id === primaryId);
      if (primaryEl) {
        const primaryPos = this.dragOffset.get(primaryId);
        if (primaryPos) {
          const movedBounds = shiftBounds(getElementBounds(primaryEl), dx - (getElementPos(primaryEl).x - primaryPos.x), dy - (getElementPos(primaryEl).y - primaryPos.y));
          const otherBounds = ctx.elements
            .filter(el => !ctx.getSelectedIds().has(el.id))
            .map(getElementBounds);
          this.guides = snapToGuides(
            movedBounds,
            otherBounds,
            ctx.snapConfig,
            ctx.viewport,
          );
          const offsetX = this.guides.snappedPoint.x - movedBounds.centerX;
          const offsetY = this.guides.snappedPoint.y - movedBounds.centerY;
          dx += offsetX;
          dy += offsetY;
        }
      }
    }

    for (const id of this.dragOffset.keys()) {
      const orig = this.dragOffset.get(id)!;
      ctx.updateElement(id, (el) => moveElement(el, orig.x + dx, orig.y + dy));
    }

    ctx.setGuides(this.guides);
    ctx.scheduleRender();
  }

  onPointerUp(_e: PointerEvent, ctx: ToolContext) {
    this.isDragging = false;
    this.dragStart = null;
    this.dragOffset.clear();
    this.guides = null;
    ctx.setGuides(null);
    ctx.resolveBindings();
    ctx.scheduleRender();
  }

  onKeyDown(e: KeyboardEvent, ctx: ToolContext) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const ids = Array.from(ctx.getSelectedIds());
      if (ids.length > 0) {
        const expandedIds: string[] = [];
        for (const id of ids) {
          const el = ctx.elements.find(el => el.id === id);
          if (el?.type === 'group') {
            const g = el as GroupElement;
            expandedIds.push(...g.memberIds, id);
          } else {
            expandedIds.push(id);
          }
        }
        ctx.deleteElements(expandedIds);
        ctx.setSelectedIds(new Set());
      }
    }
  }
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function hitTest(el: WBElement, point: Point): boolean {
  const margin = 4;
  if (el.type === 'path') {
    for (const p of el.points) {
      if (
        Math.abs(p.x - point.x) < margin + el.strokeWidth &&
        Math.abs(p.y - point.y) < margin + el.strokeWidth
      ) {
        return true;
      }
    }
    return false;
  }
  if (el.type === 'rectangle') {
    return (
      point.x >= el.x - margin &&
      point.x <= el.x + el.width + margin &&
      point.y >= el.y - margin &&
      point.y <= el.y + el.height + margin
    );
  }
  if (el.type === 'ellipse') {
    const nx = (point.x - el.x) / (el.rx + margin);
    const ny = (point.y - el.y) / (el.ry + margin);
    return nx * nx + ny * ny <= 1;
  }
  if (el.type === 'text' || el.type === 'sticky' || el.type === 'image') {
    return (
      point.x >= el.x - margin &&
      point.x <= el.x + el.width + margin &&
      point.y >= el.y - margin &&
      point.y <= el.y + el.height + margin
    );
  }
  if (el.type === 'arrow') {
    return (
      pointToSegmentDistance(
        point,
        { x: el.startX, y: el.startY },
        { x: el.endX, y: el.endY }
      ) <
      margin + el.strokeWidth
    );
  }
  if (el.type === 'group') {
    const g = el as GroupElement;
    const b = g.bounds;
    if (!b) return false;
    const pad = 8;
    return (
      point.x >= b.left - pad &&
      point.x <= b.right + pad &&
      point.y >= b.top - pad &&
      point.y <= b.bottom + pad
    );
  }
  return false;
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

export function getElementPos(el: WBElement): Point {
  if (el.type === 'path') {
    return { x: el.points[0]?.x ?? 0, y: el.points[0]?.y ?? 0 };
  }
  if (el.type === 'rectangle') {
    return { x: el.x, y: el.y };
  }
  if (el.type === 'ellipse') {
    return { x: el.x - el.rx, y: el.y - el.ry };
  }
  if (el.type === 'text' || el.type === 'sticky') {
    return { x: el.x, y: el.y };
  }
  if (el.type === 'image') {
    return { x: el.x, y: el.y };
  }
  if (el.type === 'arrow') {
    return { x: el.startX, y: el.startY };
  }
  if (el.type === 'group') {
    const g = el as GroupElement;
    if (g.bounds) return { x: g.bounds.left, y: g.bounds.top };
    return { x: 0, y: 0 };
  }
  return { x: 0, y: 0 };
}

export function moveElement(el: WBElement, x: number, y: number): WBElement {
  if (el.type === 'path') {
    const orig = getElementPos(el);
    const dx = x - orig.x;
    const dy = y - orig.y;
    return {
      ...el,
      points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  }
  if (el.type === 'rectangle') {
    return { ...el, x, y };
  }
  if (el.type === 'ellipse') {
    return { ...el, x: x + el.rx, y: y + el.ry };
  }
  if (el.type === 'text' || el.type === 'sticky') {
    return { ...el, x, y };
  }
  if (el.type === 'image') {
    return { ...el, x, y };
  }
  if (el.type === 'arrow') {
    const orig = getElementPos(el);
    const dx = x - orig.x;
    const dy = y - orig.y;
    return {
      ...el,
      startX: el.startX + dx,
      startY: el.startY + dy,
      endX: el.endX + dx,
      endY: el.endY + dy,
    };
  }
  if (el.type === 'group') return el;
  return el;
}

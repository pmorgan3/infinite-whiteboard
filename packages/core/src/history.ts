import type { WBElement, GroupElement } from './types';
import { cleanupBindings } from './snap';

export interface Command {
  execute(): void;
  undo(): void;
}

export class HistoryStack {
  private stack: Command[] = [];
  private index = -1;
  private maxSize = 200;

  execute(cmd: Command) {
    cmd.execute();
    // Remove any redo commands
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }
    this.stack.push(cmd);
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  undo() {
    if (this.index < 0) return;
    this.stack[this.index].undo();
    this.index--;
  }

  redo() {
    if (this.index >= this.stack.length - 1) return;
    this.index++;
    this.stack[this.index].execute();
  }

  canUndo(): boolean {
    return this.index >= 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }
}

export class AddElementCommand implements Command {
  constructor(
    private elements: WBElement[],
    private element: WBElement
  ) {}

  execute() {
    this.elements.push(this.element);
  }

  undo() {
    const idx = this.elements.findIndex((e) => e.id === this.element.id);
    if (idx !== -1) this.elements.splice(idx, 1);
  }
}

export class DeleteElementsCommand implements Command {
  private deleted: WBElement[] = [];

  constructor(
    private elements: WBElement[],
    private ids: string[]
  ) {}

  execute() {
    this.deleted = [];
    for (let i = this.elements.length - 1; i >= 0; i--) {
      if (this.ids.includes(this.elements[i].id)) {
        this.deleted.push(this.elements[i]);
        this.elements.splice(i, 1);
      }
    }
    cleanupBindings(this.elements, new Set(this.ids));
  }

  undo() {
    for (const el of this.deleted) {
      this.elements.push(el);
    }
  }
}

export class MoveElementsCommand implements Command {
  private originalPositions: Map<string, PointLike> = new Map();

  constructor(
    private elements: WBElement[],
    private ids: string[],
    private dx: number,
    private dy: number
  ) {}

  execute() {
    for (const id of this.ids) {
      const el = this.elements.find((e) => e.id === id);
      if (!el) continue;
      this.originalPositions.set(id, getPos(el));
      setPos(el, getPos(el).x + this.dx, getPos(el).y + this.dy);
    }
  }

  undo() {
    for (const id of this.ids) {
      const el = this.elements.find((e) => e.id === id);
      if (!el) continue;
      const orig = this.originalPositions.get(id);
      if (orig) setPos(el, orig.x, orig.y);
    }
  }
}

export class UpdateElementCommand implements Command {
  private before: Record<string, unknown>;

  constructor(
    private elements: WBElement[],
    private elementId: string,
    private after: Partial<WBElement>,
  ) {
    const el = elements.find((e) => e.id === elementId);
    this.before = {};
    if (el) {
      for (const key of Object.keys(after)) {
        this.before[key] = (el as any)[key];
      }
    }
  }

  execute() {
    const el = this.elements.find((e) => e.id === this.elementId);
    if (el) Object.assign(el, this.after);
  }

  undo() {
    const el = this.elements.find((e) => e.id === this.elementId);
    if (el) Object.assign(el, this.before);
  }
}

interface PointLike {
  x: number;
  y: number;
}

function getPos(el: WBElement): PointLike {
  if (el.type === 'path') {
    const first = el.points[0];
    return first ? { x: first.x, y: first.y } : { x: 0, y: 0 };
  }
  if (el.type === 'rectangle') return { x: el.x, y: el.y };
  if (el.type === 'ellipse') return { x: el.x - el.rx, y: el.y - el.ry };
  if (el.type === 'text') return { x: el.x, y: el.y };
  if (el.type === 'image') return { x: el.x, y: el.y };
  if (el.type === 'arrow') return { x: el.startX, y: el.startY };
  if (el.type === 'group') {
    const g = el as GroupElement;
    if (g.bounds) return { x: g.bounds.left, y: g.bounds.top };
    return { x: 0, y: 0 };
  }
  return { x: 0, y: 0 };
}

function setPos(el: WBElement, x: number, y: number) {
  if (el.type === 'path') {
    const orig = getPos(el);
    const dx = x - orig.x;
    const dy = y - orig.y;
    for (const p of el.points) {
      p.x += dx;
      p.y += dy;
    }
  } else if (el.type === 'rectangle') {
    el.x = x;
    el.y = y;
  } else if (el.type === 'ellipse') {
    el.x = x + el.rx;
    el.y = y + el.ry;
  } else if (el.type === 'text') {
    el.x = x;
    el.y = y;
  } else if (el.type === 'image') {
    el.x = x;
    el.y = y;
  } else if (el.type === 'arrow') {
    const dx = x - el.startX;
    const dy = y - el.startY;
    el.startX += dx;
    el.startY += dy;
    el.endX += dx;
    el.endY += dy;
  }
  // group has no position to set
}

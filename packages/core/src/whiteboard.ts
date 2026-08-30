import type { Point, WBElement, ToolType, SnapConfig, SnapGuides, ThemeConfig, WhiteboardState, GroupElement } from './types';
import { DARK_THEME, GROUP_COLORS } from './types';
import { Viewport } from './viewport';
import { Renderer } from './renderer';
import type { Tool } from './tools';
import { createTool, generateId } from './tools';
import { HistoryStack, AddElementCommand, DeleteElementsCommand, UpdateElementCommand, SnapshotCommand } from './history';
import { snapToGrid as snapToGridFn, resolveBindings as resolveBindingsFn } from './snap';
import { createGroup, getGroupBounds } from './group-utils';
import { createClipboardPayload, parseClipboardPayload, remapClipboardElements, WHITEBOARD_CLIPBOARD_MIME } from './clipboard';

const STATE_VERSION = '1.0.0';

export interface WhiteboardOptions {
  canvas: HTMLCanvasElement;
  onChange?: () => void;
  onStartEditing?: (elementId: string) => void;
  onRequestImageUpload?: (point: Point) => void;
  onSelectionChange?: (ids: Set<string>) => void;
}

export class Whiteboard {
  viewport: Viewport;
  renderer: Renderer;
  elements: WBElement[] = [];
  selectedIds: Set<string> = new Set();
  history: HistoryStack;

  toolType: ToolType = 'pan';
  toolColor = '#1f2937';
  toolStrokeWidth = 2;
  toolArrowStart = false;
  toolArrowEnd = true;
  editingElementId: string | null = null;
  snapConfig: SnapConfig = { enabled: false, gridSize: 20, threshold: 8 };
  activeGuides: SnapGuides | null = null;
  arrowSnapTargetId: string | null = null;
  theme: ThemeConfig = DARK_THEME;
  private activeTool: Tool;

  private onWheelBind: (e: WheelEvent) => void;
  private onPointerDownBind: (e: PointerEvent) => void;
  private onPointerMoveBind: (e: PointerEvent) => void;
  private onPointerUpBind: (e: PointerEvent) => void;
  private onKeyDownBind: (e: KeyboardEvent) => void;
  private onResizeBind: () => void;
  private onPasteBind: (e: ClipboardEvent) => void;
  private onTouchStartBind: (e: TouchEvent) => void;
  private onTouchMoveBind: (e: TouchEvent) => void;
  private onTouchEndBind: (e: TouchEvent) => void;

  private touchStartDist: number | null = null;
  private touchStartZoom = 1;
  private touchStartCenter: Point = { x: 0, y: 0 };
  private pointerCount = 0;
  private savedToolType: ToolType | null = null;
  private lastTapTime = 0;

  private rafId: number | null = null;
  private needsRender = false;
  private onChange?: () => void;
  private pasteCount = 0;
  private onStartEditing?: (elementId: string) => void;
  private onRequestImageUpload?: (point: Point) => void;
  private onSelectionChange?: (ids: Set<string>) => void;

  constructor(options: WhiteboardOptions) {
    this.viewport = new Viewport();
    this.renderer = new Renderer(options.canvas, () => this.scheduleRender());
    this.history = new HistoryStack();
    this.onChange = options.onChange;
    this.onStartEditing = options.onStartEditing;
    this.onRequestImageUpload = options.onRequestImageUpload;
    this.onSelectionChange = options.onSelectionChange;
    this.activeTool = createTool(this.toolType, { color: this.toolColor, strokeWidth: this.toolStrokeWidth });

    this.onWheelBind = this.onWheel.bind(this);
    this.onPointerDownBind = this.onPointerDown.bind(this);
    this.onPointerMoveBind = this.onPointerMove.bind(this);
    this.onPointerUpBind = this.onPointerUp.bind(this);
    this.onKeyDownBind = this.onKeyDown.bind(this);
    this.onResizeBind = this.onResize.bind(this);
    this.onPasteBind = this.onPaste.bind(this);
    this.onTouchStartBind = this.onTouchStart.bind(this);
    this.onTouchMoveBind = this.onTouchMove.bind(this);
    this.onTouchEndBind = this.onTouchEnd.bind(this);

    this.attach(options.canvas);
    this.renderer.resize();
    this.scheduleRender();
  }

  private attach(canvas: HTMLCanvasElement) {
    canvas.addEventListener('wheel', this.onWheelBind, { passive: false });
    canvas.addEventListener('pointerdown', this.onPointerDownBind);
    canvas.addEventListener('touchstart', this.onTouchStartBind, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMoveBind, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEndBind, { passive: false });
    window.addEventListener('pointermove', this.onPointerMoveBind);
    window.addEventListener('pointerup', this.onPointerUpBind);
    window.addEventListener('keydown', this.onKeyDownBind);
    window.addEventListener('resize', this.onResizeBind);
    window.addEventListener('paste', this.onPasteBind);
  }

  destroy() {
    const canvas = this.renderer['canvas'];
    canvas.removeEventListener('wheel', this.onWheelBind);
    canvas.removeEventListener('pointerdown', this.onPointerDownBind);
    canvas.removeEventListener('touchstart', this.onTouchStartBind);
    canvas.removeEventListener('touchmove', this.onTouchMoveBind);
    canvas.removeEventListener('touchend', this.onTouchEndBind);
    window.removeEventListener('pointermove', this.onPointerMoveBind);
    window.removeEventListener('pointerup', this.onPointerUpBind);
    window.removeEventListener('keydown', this.onKeyDownBind);
    window.removeEventListener('resize', this.onResizeBind);
    window.removeEventListener('paste', this.onPasteBind);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  setTool(type: ToolType) {
    this.toolType = type;
    this.activeTool = createTool(type, {
      color: this.toolColor,
      strokeWidth: this.toolStrokeWidth,
      arrowStart: this.toolArrowStart,
      arrowEnd: this.toolArrowEnd,
    });
  }

  setToolOptions(options: { color?: string; strokeWidth?: number; arrowStart?: boolean; arrowEnd?: boolean }) {
    if (options.color !== undefined) this.toolColor = options.color;
    if (options.strokeWidth !== undefined) this.toolStrokeWidth = options.strokeWidth;
    if (options.arrowStart !== undefined) this.toolArrowStart = options.arrowStart;
    if (options.arrowEnd !== undefined) this.toolArrowEnd = options.arrowEnd;
    this.activeTool = createTool(this.toolType, {
      color: this.toolColor,
      strokeWidth: this.toolStrokeWidth,
      arrowStart: this.toolArrowStart,
      arrowEnd: this.toolArrowEnd,
    });
  }

  undo() {
    this.history.undo();
    this.scheduleRender();
    this.onChange?.();
  }

  redo() {
    this.history.redo();
    this.scheduleRender();
    this.onChange?.();
  }

  startEditing(elementId: string) {
    this.editingElementId = elementId;
    this.onStartEditing?.(elementId);
    this.scheduleRender();
  }

  stopEditing() {
    this.editingElementId = null;
    this.scheduleRender();
  }

  addElement(el: WBElement) {
    this.history.execute(new AddElementCommand(this.elements, el));
    this.scheduleRender();
    this.onChange?.();
  }

  updateElement(id: string, updater: (el: WBElement) => WBElement) {
    const idx = this.elements.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this.elements[idx] = updater(this.elements[idx]);
      this.scheduleRender();
    }
  }

  updateElementWithHistory(id: string, changes: Partial<WBElement>) {
    const idx = this.elements.findIndex((e) => e.id === id);
    if (idx === -1) return;
    this.history.execute(new UpdateElementCommand(this.elements, id, changes));
    this.scheduleRender();
    this.onChange?.();
  }

  private getToolContext() {
    const canvas = this.renderer['canvas'] as HTMLCanvasElement;
    const getOffset = (e: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    return {
      viewport: this.viewport,
      elements: this.elements,
      addElement: (el: WBElement) => {
        this.history.execute(new AddElementCommand(this.elements, el));
        this.scheduleRender();
        this.onChange?.();
      },
      updateElement: (id: string, updater: (el: WBElement) => WBElement) => {
        const idx = this.elements.findIndex((e) => e.id === id);
        if (idx !== -1) {
          this.elements[idx] = updater(this.elements[idx]);
          this.scheduleRender();
        }
      },
      deleteElements: (ids: string[]) => {
        this.history.execute(new DeleteElementsCommand(this.elements, ids));
        this.cleanupOrphanedMembers(new Set(ids));
        this.scheduleRender();
        this.onChange?.();
      },
      getSelectedIds: () => this.selectedIds,
      setSelectedIds: (ids: Set<string>) => {
        this.selectedIds = ids;
        this.onSelectionChange?.(new Set(ids));
        this.scheduleRender();
      },
      canvasWidth: canvas.clientWidth,
      canvasHeight: canvas.clientHeight,
      scheduleRender: () => this.scheduleRender(),
      getOffset,
      activeColor: this.toolColor,
      startEditing: (id: string) => this.startEditing(id),
      requestImageUpload: (point: Point) => this.onRequestImageUpload?.(point),
      snapConfig: this.snapConfig,
      snapToGrid: (point: Point) => snapToGridFn(point, this.snapConfig),
      setGuides: (guides: SnapGuides | null) => {
        this.activeGuides = guides;
      },
      resolveBindings: () => {
        resolveBindingsFn(this.elements);
      },
      setArrowSnapTarget: (id: string | null) => {
        this.arrowSnapTargetId = id;
      },
      commitSnapshot: (before: WBElement[], selectionBefore: Set<string>) => {
        const after = structuredClone(this.elements);
        this.history.execute(new SnapshotCommand(this.elements, before, after, ids => { this.selectedIds = ids; }, selectionBefore, this.selectedIds));
        this.scheduleRender();
        this.onChange?.();
      },
    };
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const canvas = this.renderer['canvas'];
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldBefore = this.viewport.screenToWorld(
      { x: mouseX, y: mouseY },
      canvas.clientWidth,
      canvas.clientHeight
    );

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(10, this.viewport.zoom * zoomFactor));
    this.viewport.zoom = newZoom;

    const worldAfter = this.viewport.screenToWorld(
      { x: mouseX, y: mouseY },
      canvas.clientWidth,
      canvas.clientHeight
    );

    this.viewport.x += (worldAfter.x - worldBefore.x) * this.viewport.zoom;
    this.viewport.y += (worldAfter.y - worldBefore.y) * this.viewport.zoom;

    this.scheduleRender();
  }

  private onPointerDown(e: PointerEvent) {
    if (this.editingElementId) return;
    const canvas = this.renderer['canvas'];
    if (e.target !== canvas) return;
    this.pointerCount++;
    if (this.pointerCount >= 2) {
      if (!this.savedToolType) {
        this.savedToolType = this.toolType;
      }
      this.activeTool = createTool('pan', { color: this.toolColor, strokeWidth: this.toolStrokeWidth });
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    this.activeTool.onPointerDown(e, this.getToolContext());
  }

  private onPointerMove(e: PointerEvent) {
    this.activeTool.onPointerMove(e, this.getToolContext());
  }

  private onPointerUp(e: PointerEvent) {
    this.pointerCount = Math.max(0, this.pointerCount - 1);
    if (this.pointerCount < 2 && this.savedToolType) {
      this.activeTool = createTool(this.savedToolType, {
        color: this.toolColor,
        strokeWidth: this.toolStrokeWidth,
        arrowStart: this.toolArrowStart,
        arrowEnd: this.toolArrowEnd,
      });
      this.savedToolType = null;
    }
    this.activeTool.onPointerUp(e, this.getToolContext());
    try {
      const canvas = this.renderer['canvas'];
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  private onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      this.touchStartDist = this.getTouchDistance(e.touches[0], e.touches[1]);
      this.touchStartZoom = this.viewport.zoom;
      const rect = (this.renderer['canvas'] as HTMLCanvasElement).getBoundingClientRect();
      this.touchStartCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
    }
  }

  private onTouchMove(e: TouchEvent) {
    if (e.touches.length === 2 && this.touchStartDist !== null) {
      e.preventDefault();
      const canvas = this.renderer['canvas'] as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const dist = this.getTouchDistance(e.touches[0], e.touches[1]);
      const scale = dist / this.touchStartDist;
      const newZoom = Math.max(0.05, Math.min(10, this.touchStartZoom * scale));
      this.viewport.zoomToPoint(
        this.touchStartCenter.x,
        this.touchStartCenter.y,
        newZoom,
        canvas.clientWidth,
        canvas.clientHeight
      );
      const currentCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
      this.viewport.x += (currentCenter.x - this.touchStartCenter.x);
      this.viewport.y += (currentCenter.y - this.touchStartCenter.y);
      this.scheduleRender();
    }
  }

  private onTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0 && e.changedTouches.length === 1) {
      const now = Date.now();
      if (now - this.lastTapTime < 300) {
        this.viewport.x = 0;
        this.viewport.y = 0;
        this.viewport.zoom = 1;
        this.scheduleRender();
      }
      this.lastTapTime = now;
    }
    this.touchStartDist = null;
  }

  private getTouchDistance(t1: Touch, t2: Touch): number {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  private onKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); void this.copySelection(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); this.duplicateSelection(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      e.preventDefault();
      if (e.shiftKey) {
        this.ungroupSelection();
      } else {
        this.createGroupFromSelection();
      }
      return;
    }
    if (this.activeTool.onKeyDown) {
      this.activeTool.onKeyDown(e, this.getToolContext());
    }
  }

  private onResize() {
    this.renderer.resize();
    this.scheduleRender();
  }

  private onPaste(e: ClipboardEvent) {
    const internal = e.clipboardData?.getData(WHITEBOARD_CLIPBOARD_MIME) || e.clipboardData?.getData('text/plain');
    const payload = internal ? parseClipboardPayload(internal) : null;
    if (payload) { e.preventDefault(); this.pasteElements(payload.elements); return; }
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (!dataUrl) return;
          const img = new Image();
          img.onload = () => {
            const canvas = this.renderer['canvas'] as HTMLCanvasElement;
            const center = this.viewport.screenToWorld(
              { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
              canvas.clientWidth,
              canvas.clientHeight
            );
            const MAX_WIDTH = 800;
            let width = img.naturalWidth;
            let height = img.naturalHeight;
            if (width > MAX_WIDTH) {
              height = (height * MAX_WIDTH) / width;
              width = MAX_WIDTH;
            }
            this.addElement({
              id: generateId(),
              type: 'image',
              x: center.x - width / 2,
              y: center.y - height / 2,
              width,
              height,
              src: dataUrl,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              color: '',
              strokeWidth: 0,
            });
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(blob);
      }
    }
  }

  async copySelection(): Promise<void> {
    if (!this.selectedIds.size) return;
    const text = JSON.stringify(createClipboardPayload(this.elements, this.selectedIds));
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ [WHITEBOARD_CLIPBOARD_MIME]: new Blob([text], { type: WHITEBOARD_CLIPBOARD_MIME }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } else await navigator.clipboard?.writeText(text);
  }

  pasteElements(source: WBElement[]): void {
    this.pasteCount++;
    const copies = remapClipboardElements(source, 20 * this.pasteCount);
    const before = structuredClone(this.elements);
    const selectionBefore = new Set(this.selectedIds);
    this.elements.push(...copies);
    this.selectedIds = new Set(copies.map(el => el.id));
    this.history.execute(new SnapshotCommand(this.elements, before, structuredClone(this.elements), ids => { this.selectedIds = ids; this.onSelectionChange?.(ids); }, selectionBefore, this.selectedIds));
    this.scheduleRender(); this.onChange?.();
  }

  duplicateSelection(): void {
    if (!this.selectedIds.size) return;
    const payload = createClipboardPayload(this.elements, this.selectedIds);
    this.pasteCount = 0;
    this.pasteElements(payload.elements);
  }

  updateSelection(changes: Pick<Partial<WBElement>, 'color' | 'strokeWidth' | 'locked'>): void {
    const before = structuredClone(this.elements);
    let changed = false;
    for (const el of this.elements) if (this.selectedIds.has(el.id) && (!el.locked || changes.locked !== undefined)) { Object.assign(el, changes); changed = true; }
    if (changed) { this.history.execute(new SnapshotCommand(this.elements, before, structuredClone(this.elements))); this.scheduleRender(); this.onChange?.(); }
  }

  reorderSelection(action: 'forward' | 'front' | 'backward' | 'back'): void {
    const movable = new Set([...this.selectedIds].filter(id => !this.elements.find(el => el.id === id)?.locked));
    for (const el of this.elements) if (el.type === 'group' && movable.has(el.id)) el.memberIds.forEach(id => movable.add(id));
    if (!movable.size) return;
    const before = structuredClone(this.elements);
    if (action === 'front' || action === 'back') {
      const chosen = this.elements.filter(el => movable.has(el.id)), rest = this.elements.filter(el => !movable.has(el.id));
      this.elements.splice(0, this.elements.length, ...(action === 'front' ? [...rest, ...chosen] : [...chosen, ...rest]));
    } else {
      const direction = action === 'forward' ? 1 : -1;
      const start = direction === 1 ? this.elements.length - 2 : 1, end = direction === 1 ? -1 : this.elements.length;
      for (let i = start; i !== end; i -= direction) if (movable.has(this.elements[i].id) && !movable.has(this.elements[i + direction].id)) [this.elements[i], this.elements[i + direction]] = [this.elements[i + direction], this.elements[i]];
    }
    this.history.execute(new SnapshotCommand(this.elements, before, structuredClone(this.elements))); this.scheduleRender(); this.onChange?.();
  }

  getState(themeMode: 'light' | 'dark'): WhiteboardState {
    return {
      version: STATE_VERSION,
      elements: this.elements,
      viewport: this.viewport.toState(),
      toolColor: this.toolColor,
      toolStrokeWidth: this.toolStrokeWidth,
      toolArrowStart: this.toolArrowStart,
      toolArrowEnd: this.toolArrowEnd,
      snapEnabled: this.snapConfig.enabled,
      themeMode,
    };
  }

  setState(state: WhiteboardState): void {
    if (state.version !== STATE_VERSION) return;
    this.elements = state.elements.map(el => ({ ...el, rotation: el.rotation ?? 0, locked: el.locked ?? false }));
    this.viewport = new Viewport(state.viewport);
    this.toolColor = state.toolColor;
    this.toolStrokeWidth = state.toolStrokeWidth;
    this.toolArrowStart = state.toolArrowStart;
    this.toolArrowEnd = state.toolArrowEnd;
    this.snapConfig.enabled = state.snapEnabled;
    this.selectedIds = new Set();
    this.editingElementId = null;
    this.activeTool = createTool(this.toolType, {
      color: this.toolColor,
      strokeWidth: this.toolStrokeWidth,
      arrowStart: this.toolArrowStart,
      arrowEnd: this.toolArrowEnd,
    });
    this.history = new HistoryStack();
    this.onChange?.();
    this.scheduleRender();
  }

  resolveBindings() {
    resolveBindingsFn(this.elements);
  }

  private resolveGroupBounds() {
    for (const el of this.elements) {
      if (el.type === 'group') {
        const g = el as GroupElement;
        const members = g.memberIds
          .map(id => this.elements.find(e => e.id === id))
          .filter(Boolean) as WBElement[];
        g.bounds = getGroupBounds(members);
      }
    }
  }

  cleanupOrphanedMembers(deletedIds: Set<string>) {
    const groupsToRemove: string[] = [];
    for (const el of this.elements) {
      if (el.type === 'group') {
        const g = el as GroupElement;
        const remaining = g.memberIds.filter(id => !deletedIds.has(id) && this.elements.some(e => e.id === id));
        if (remaining.length <= 1) {
          groupsToRemove.push(g.id);
        } else if (remaining.length !== g.memberIds.length) {
          g.memberIds = remaining;
        }
      }
    }
    if (groupsToRemove.length > 0) {
      this.elements = this.elements.filter(e => !groupsToRemove.includes(e.id));
    }
  }

  createGroupFromSelection(label?: string, color?: string): string | null {
    if (this.selectedIds.size < 2) return null;
    const groupColor = color ?? GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
    const groupLabel = label ?? 'Group';

    const allMemberIds = [...this.selectedIds].flatMap(id => {
      const el = this.elements.find(e => e.id === id);
      if (el?.type === 'group') return (el as GroupElement).memberIds;
      return [id];
    });

    const group = createGroup([...new Set(allMemberIds)], groupLabel, groupColor);
    this.addElement(group);
    this.selectedIds = new Set([group.id]);
    this.onChange?.();
    return group.id;
  }

  ungroupSelection(): void {
    const selected = [...this.selectedIds];
    for (const id of selected) {
      const el = this.elements.find(e => e.id === id);
      if (el && el.type === 'group') {
        const group = el as GroupElement;
        this.history.execute(new DeleteElementsCommand(this.elements, [group.id]));
        for (const mid of group.memberIds) {
          this.selectedIds.add(mid);
        }
      }
    }
    this.scheduleRender();
    this.onChange?.();
  }

  addToGroup(groupId: string, elementIds: string[]): void {
    const group = this.elements.find(e => e.id === groupId);
    if (!group || group.type !== 'group') return;
    const g = group as GroupElement;
    const newMembers = [...new Set([...g.memberIds, ...elementIds])];
    this.updateElementWithHistory(groupId, { memberIds: newMembers } as any);
  }

  removeFromGroup(groupId: string, elementId: string): void {
    const group = this.elements.find(e => e.id === groupId);
    if (!group || group.type !== 'group') return;
    const g = group as GroupElement;
    const newMembers = g.memberIds.filter(id => id !== elementId);
    if (newMembers.length === 0) {
      this.history.execute(new DeleteElementsCommand(this.elements, [groupId]));
    } else {
      this.updateElementWithHistory(groupId, { memberIds: newMembers } as any);
    }
  }

  scheduleRender() {
    if (this.needsRender) return;
    this.needsRender = true;
    this.rafId = requestAnimationFrame(() => {
      this.needsRender = false;
      this.resolveBindings();
      this.resolveGroupBounds();
      const preview = this.buildPreview();
      this.renderer.render(this.viewport, this.elements, this.selectedIds, preview, this.activeGuides, this.snapConfig, this.theme);
      if (this.arrowSnapTargetId) {
        const targetEl = this.elements.find(e => e.id === this.arrowSnapTargetId);
        if (targetEl) {
          this.renderer.drawSnapHighlight(targetEl, this.viewport);
          this.renderer.drawAnchorPoints(targetEl, this.viewport);
        }
      }
    });
  }

  private buildPreview() {
    const tool = this.activeTool as any;
    if (this.toolType === 'draw' && tool.getPreview) {
      const pts = tool.getPreview() as Point[];
      if (pts.length > 0) {
        return { type: 'path' as const, points: pts, color: this.toolColor, strokeWidth: this.toolStrokeWidth };
      }
    }
    if ((this.toolType === 'rectangle' || this.toolType === 'ellipse') && tool.getPreview) {
      const p = tool.getPreview() as { start: Point; end: Point } | null;
      if (p) {
        if (this.toolType === 'rectangle') {
          return {
            type: 'rectangle' as const,
            x: Math.min(p.start.x, p.end.x),
            y: Math.min(p.start.y, p.end.y),
            width: Math.abs(p.end.x - p.start.x),
            height: Math.abs(p.end.y - p.start.y),
            color: this.toolColor,
            strokeWidth: this.toolStrokeWidth,
          };
        } else {
          return {
            type: 'ellipse' as const,
            x: (p.start.x + p.end.x) / 2,
            y: (p.start.y + p.end.y) / 2,
            rx: Math.abs(p.end.x - p.start.x) / 2,
            ry: Math.abs(p.end.y - p.start.y) / 2,
            color: this.toolColor,
            strokeWidth: this.toolStrokeWidth,
          };
        }
      }
    }
    if (this.toolType === 'arrow' && tool.getPreview) {
      const p = tool.getPreview() as { start: Point; end: Point } | null;
      if (p) {
        return {
          type: 'arrow' as const,
          startX: p.start.x,
          startY: p.start.y,
          endX: p.end.x,
          endY: p.end.y,
          startArrowhead: this.toolArrowStart,
          endArrowhead: this.toolArrowEnd,
          color: this.toolColor,
          strokeWidth: this.toolStrokeWidth,
        };
      }
    }
    return undefined;
  }
}

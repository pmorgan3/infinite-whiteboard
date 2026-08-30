import type { WBElement, Point, SnapConfig, SnapGuides, ThemeConfig, AnchorPosition, GroupElement } from './types';
import { LIGHT_THEME } from './types';
import type { Viewport } from './viewport';
import { getElementBounds, getAnchorPoint } from './snap';
import { getGroupBounds } from './group-utils';

export type RenderPreview =
  | {
      type: 'path';
      points: Point[];
      color: string;
      strokeWidth: number;
    }
  | {
      type: 'rectangle';
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      strokeWidth: number;
    }
  | {
      type: 'ellipse';
      x: number;
      y: number;
      rx: number;
      ry: number;
      color: string;
      strokeWidth: number;
    }
  | {
      type: 'arrow';
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      startArrowhead: boolean;
      endArrowhead: boolean;
      color: string;
      strokeWidth: number;
    };

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private imageCache = new Map<string, HTMLImageElement>();
  private onNeedRender?: () => void;

  constructor(private canvas: HTMLCanvasElement, onNeedRender?: () => void) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context');
    this.ctx = ctx;
    this.onNeedRender = onNeedRender;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  render(
    viewport: Viewport,
    elements: WBElement[],
    selectedIds: Set<string>,
    preview?: RenderPreview,
    snapGuides?: SnapGuides | null,
    snapConfig?: SnapConfig,
    theme?: ThemeConfig,
  ) {
    const t = theme ?? LIGHT_THEME;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    this.ctx.fillStyle = t.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(width / 2 + viewport.x, height / 2 + viewport.y);
    this.ctx.scale(viewport.zoom, viewport.zoom);

    this.drawGrid(viewport, width, height, t);
    if (snapConfig?.enabled && preview) {
      this.drawSnapHighlights(viewport, width, height, preview, snapConfig, t);
    }
    this.drawElements(elements, selectedIds, t);
    if (preview) this.drawPreview(preview);
    if (snapGuides) {
      this.drawSnapGuides(viewport, width, height, snapGuides, t);
    }

    this.ctx.restore();
  }

  renderForExport(
    canvas: HTMLCanvasElement,
    elements: WBElement[],
    viewport: Viewport,
    options: { width: number; height: number; background: string; dpr: number },
  ) {
    canvas.width = options.width * options.dpr;
    canvas.height = options.height * options.dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(options.dpr, 0, 0, options.dpr, 0, 0);
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, options.width, options.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dpr = options.dpr;
    ctx.scale(dpr, dpr);

    ctx.save();
    ctx.translate(options.width / 2 + viewport.x, options.height / 2 + viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    const savedCtx = this.ctx;
    this.ctx = ctx;
    this.drawElements(elements, new Set(), LIGHT_THEME);
    this.ctx = savedCtx;

    ctx.restore();
  }

  private drawGrid(viewport: Viewport, width: number, height: number, theme: ThemeConfig) {
    const baseSpacing = 20;
    let spacing = baseSpacing;
    if (viewport.zoom > 1.5) spacing = baseSpacing / 2;
    else if (viewport.zoom < 0.75) spacing = baseSpacing * 2;
    if (viewport.zoom < 0.4) spacing = baseSpacing * 4;
    if (viewport.zoom < 0.2) spacing = baseSpacing * 8;

    const topLeft = viewport.screenToWorld({ x: 0, y: 0 }, width, height);
    const bottomRight = viewport.screenToWorld(
      { x: width, y: height },
      width,
      height
    );

    const startX = Math.floor(topLeft.x / spacing) * spacing;
    const endX = Math.ceil(bottomRight.x / spacing) * spacing;
    const startY = Math.floor(topLeft.y / spacing) * spacing;
    const endY = Math.ceil(bottomRight.y / spacing) * spacing;

    this.ctx.fillStyle = theme.gridDot;
    for (let x = startX; x <= endX; x += spacing) {
      for (let y = startY; y <= endY; y += spacing) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 1 / viewport.zoom, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawElements(elements: WBElement[], selectedIds: Set<string>, theme: ThemeConfig) {
    // First pass: draw group backgrounds
    for (const el of elements) {
      if (el.type === 'group') {
        this.drawGroup(el as GroupElement, elements);
      }
    }

    // Second pass: draw all non-group elements
    for (const el of elements) {
      if (el.type === 'group') continue;
      this.drawElement(el);
      if (selectedIds.has(el.id)) {
        this.drawSelectionHighlight(el, theme);
      }
    }

    // Third pass: draw group selection highlights
    for (const el of elements) {
      if (el.type === 'group' && selectedIds.has(el.id)) {
        this.drawGroupSelection(el as GroupElement, elements);
      }
    }
  }

  private drawElement(el: WBElement) {
    if (el.type === 'path') {
      this.drawPath(el);
    } else if (el.type === 'rectangle') {
      this.drawRectangle(el);
    } else if (el.type === 'ellipse') {
      this.drawEllipse(el);
    } else if (el.type === 'text') {
      this.drawText(el);
    } else if (el.type === 'image') {
      this.drawImageElement(el);
    } else if (el.type === 'arrow') {
      this.drawArrow(el);
    }
  }

  private drawPath(el: Extract<WBElement, { type: 'path' }>) {
    if (el.points.length < 2) return;
    this.ctx.strokeStyle = el.color;
    this.ctx.lineWidth = el.strokeWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) {
      this.ctx.lineTo(el.points[i].x, el.points[i].y);
    }
    this.ctx.stroke();
  }

  private drawRectangle(el: Extract<WBElement, { type: 'rectangle' }>) {
    this.ctx.strokeStyle = el.color;
    this.ctx.lineWidth = el.strokeWidth;
    this.ctx.strokeRect(el.x, el.y, el.width, el.height);
  }

  private drawEllipse(el: Extract<WBElement, { type: 'ellipse' }>) {
    this.ctx.strokeStyle = el.color;
    this.ctx.lineWidth = el.strokeWidth;
    this.ctx.beginPath();
    this.ctx.ellipse(el.x, el.y, el.rx, el.ry, 0, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private drawArrow(el: Extract<WBElement, { type: 'arrow' }>) {
    const { startX, startY, endX, endY, startArrowhead, endArrowhead, color, strokeWidth } = el;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = strokeWidth;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    if (endArrowhead) {
      this.drawArrowhead(startX, startY, endX, endY, strokeWidth);
    }
    if (startArrowhead) {
      this.drawArrowhead(endX, endY, startX, startY, strokeWidth);
    }
  }

  private drawArrowhead(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    strokeWidth: number
  ) {
    const headLength = Math.max(10, strokeWidth * 4);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(
      toX - headLength * Math.cos(angle - Math.PI / 6),
      toY - headLength * Math.sin(angle - Math.PI / 6),
    );
    this.ctx.lineTo(
      toX - headLength * Math.cos(angle + Math.PI / 6),
      toY - headLength * Math.sin(angle + Math.PI / 6),
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawText(el: Extract<WBElement, { type: 'text' }>) {
    if (el.fill && el.fill !== 'transparent') {
      this.ctx.fillStyle = el.fill;
      this.ctx.fillRect(el.x, el.y, el.width, el.height);
    }

    this.ctx.strokeStyle = el.color;
    this.ctx.lineWidth = el.strokeWidth;
    this.ctx.strokeRect(el.x, el.y, el.width, el.height);

    this.ctx.fillStyle = el.color;
    this.ctx.font = `${el.fontSize}px ${el.fontFamily}`;
    this.ctx.textBaseline = 'top';

    const lines = this.wrapText(el.text, el.width - 8);
    const lineHeight = el.fontSize * 1.3;
    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], el.x + 4, el.y + 4 + i * lineHeight);
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const paragraphs = text.split('\n');
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.split(' ');
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (this.ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private drawImageElement(el: Extract<WBElement, { type: 'image' }>) {
    const cached = this.imageCache.get(el.src);
    if (cached && cached.complete) {
      this.ctx.drawImage(cached, el.x, el.y, el.width, el.height);
    } else if (!cached) {
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(el.src, img);
        this.onNeedRender?.();
      };
      img.onerror = () => {
        // Mark as failed so we don't retry indefinitely
        this.imageCache.set(el.src, img);
      };
      img.src = el.src;
      this.imageCache.set(el.src, img);
      // Draw placeholder
      this.ctx.strokeStyle = '#9ca3af';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(el.x, el.y, el.width, el.height);
      this.ctx.setLineDash([]);
    }
  }

  private drawGroup(group: GroupElement, elements: WBElement[]) {
    const members = group.memberIds
      .map(id => elements.find(e => e.id === id))
      .filter(Boolean) as WBElement[];
    if (members.length === 0) return;

    const bounds = getGroupBounds(members);
    const pad = 8;

    this.ctx.fillStyle = group.color + '40';
    this.ctx.fillRect(
      bounds.left - pad,
      bounds.top - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
    );

    this.ctx.strokeStyle = group.color;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([8, 4]);
    this.ctx.strokeRect(
      bounds.left - pad,
      bounds.top - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
    );
    this.ctx.setLineDash([]);

    if (group.label) {
      this.ctx.fillStyle = group.color;
      this.ctx.font = '12px sans-serif';
      this.ctx.fillText(group.label, bounds.left - pad, bounds.top - pad - 4);
    }
  }

  private drawGroupSelection(group: GroupElement, elements: WBElement[]) {
    const members = group.memberIds
      .map(id => elements.find(e => e.id === id))
      .filter(Boolean) as WBElement[];
    if (members.length === 0) return;

    const bounds = getGroupBounds(members);
    const pad = 8;
    this.ctx.strokeStyle = '#3b82f6';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([]);
    this.ctx.strokeRect(
      bounds.left - pad,
      bounds.top - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
    );
  }

  private drawSelectionHighlight(el: WBElement, theme: ThemeConfig) {
    this.ctx.strokeStyle = theme.selectionStroke;
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    let bounds: { x: number; y: number; w: number; h: number };
    if (el.type === 'path') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else if (el.type === 'rectangle') {
      bounds = { x: el.x, y: el.y, w: el.width, h: el.height };
    } else if (el.type === 'ellipse') {
      bounds = { x: el.x - el.rx, y: el.y - el.ry, w: el.rx * 2, h: el.ry * 2 };
    } else if (el.type === 'text' || el.type === 'image') {
      bounds = { x: el.x, y: el.y, w: el.width, h: el.height };
    } else if (el.type === 'arrow') {
      const minX = Math.min(el.startX, el.endX);
      const minY = Math.min(el.startY, el.endY);
      const maxX = Math.max(el.startX, el.endX);
      const maxY = Math.max(el.startY, el.endY);
      bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else if (el.type === 'group') {
      // Groups use drawGroupSelection instead
      return;
    } else {
      return;
    }
    const pad = 4;
    this.ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2);
    this.ctx.setLineDash([]);
  }

  private drawPreview(preview: RenderPreview) {
    if (preview.type === 'path') {
      if (preview.points.length < 2) return;
      this.ctx.strokeStyle = preview.color;
      this.ctx.lineWidth = preview.strokeWidth;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(preview.points[0].x, preview.points[0].y);
      for (let i = 1; i < preview.points.length; i++) {
        this.ctx.lineTo(preview.points[i].x, preview.points[i].y);
      }
      this.ctx.stroke();
    } else if (preview.type === 'rectangle') {
      this.ctx.strokeStyle = preview.color;
      this.ctx.lineWidth = preview.strokeWidth;
      this.ctx.strokeRect(preview.x, preview.y, preview.width, preview.height);
    } else if (preview.type === 'ellipse') {
      this.ctx.strokeStyle = preview.color;
      this.ctx.lineWidth = preview.strokeWidth;
      this.ctx.beginPath();
      this.ctx.ellipse(preview.x, preview.y, preview.rx, preview.ry, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    } else if (preview.type === 'arrow') {
      this.ctx.strokeStyle = preview.color;
      this.ctx.lineWidth = preview.strokeWidth;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(preview.startX, preview.startY);
      this.ctx.lineTo(preview.endX, preview.endY);
      this.ctx.stroke();
      if (preview.endArrowhead) {
        this.drawArrowhead(preview.startX, preview.startY, preview.endX, preview.endY, preview.strokeWidth);
      }
      if (preview.startArrowhead) {
        this.drawArrowhead(preview.endX, preview.endY, preview.startX, preview.startY, preview.strokeWidth);
      }
    }
  }

  private drawSnapGuides(
    viewport: Viewport,
    width: number,
    height: number,
    guides: SnapGuides,
    theme: ThemeConfig,
  ) {
    this.ctx.save();
    this.ctx.strokeStyle = theme.snapGuide;
    this.ctx.lineWidth = 1 / viewport.zoom;
    this.ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);

    const topLeft = viewport.screenToWorld({ x: 0, y: 0 }, width, height);
    const bottomRight = viewport.screenToWorld({ x: width, y: height }, width, height);

    for (const x of guides.vertical) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, topLeft.y);
      this.ctx.lineTo(x, bottomRight.y);
      this.ctx.stroke();
    }

    for (const y of guides.horizontal) {
      this.ctx.beginPath();
      this.ctx.moveTo(topLeft.x, y);
      this.ctx.lineTo(bottomRight.x, y);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private drawSnapHighlights(
    viewport: Viewport,
    _width: number,
    _height: number,
    preview: RenderPreview,
    snapConfig: SnapConfig,
    theme: ThemeConfig,
  ) {
    let targetPoint: Point | null = null;
    if (preview.type === 'rectangle') {
      targetPoint = { x: preview.x + preview.width / 2, y: preview.y + preview.height / 2 };
    } else if (preview.type === 'ellipse') {
      targetPoint = { x: preview.x, y: preview.y };
    } else if (preview.type === 'arrow') {
      targetPoint = { x: preview.endX, y: preview.endY };
    } else if (preview.type === 'path' && preview.points.length > 0) {
      targetPoint = preview.points[preview.points.length - 1];
    }

    if (!targetPoint) return;

    const gridSize = snapConfig.gridSize;
    const snappedX = Math.round(targetPoint.x / gridSize) * gridSize;
    const snappedY = Math.round(targetPoint.y / gridSize) * gridSize;

    this.ctx.save();
    this.ctx.fillStyle = theme.snapHighlight;
    const r = 2.5 / viewport.zoom;
    this.ctx.beginPath();
    this.ctx.arc(snappedX - gridSize, snappedY, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(snappedX + gridSize, snappedY, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(snappedX, snappedY - gridSize, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(snappedX, snappedY + gridSize, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(snappedX, snappedY, r * 1.5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  drawSnapHighlight(el: WBElement, viewport: Viewport) {
    this.ctx.save();
    this.ctx.strokeStyle = '#3b82f6';
    this.ctx.lineWidth = 2 / viewport.zoom;
    this.ctx.setLineDash([]);
    this.ctx.shadowColor = '#3b82f6';
    this.ctx.shadowBlur = 8 / viewport.zoom;

    const bounds = getElementBounds(el);
    const pad = 4;
    this.ctx.strokeRect(
      bounds.left - pad,
      bounds.top - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
    );

    this.ctx.restore();
  }

  drawAnchorPoints(el: WBElement, viewport: Viewport) {
    const positions: AnchorPosition[] = ['top', 'right', 'bottom', 'left', 'center'];
    this.ctx.save();
    this.ctx.fillStyle = '#3b82f6';
    const r = 4 / viewport.zoom;
    for (const pos of positions) {
      const point = getAnchorPoint(el, pos);
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }
}

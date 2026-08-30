export interface Point {
  x: number;
  y: number;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export type ToolType = 'pan' | 'draw' | 'rectangle' | 'ellipse' | 'select' | 'text' | 'image' | 'arrow';

export interface BaseElement {
  id: string;
  type: string;
  color: string;
  strokeWidth: number;
  /** Clockwise rotation around the element center, in radians. */
  rotation?: number;
  locked?: boolean;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface PathElement extends BaseElement {
  type: 'path';
  points: Point[];
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export type AnchorPosition = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface ArrowBinding {
  elementId: string;
  position: AnchorPosition;
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startArrowhead: boolean;
  endArrowhead: boolean;
  startBinding: ArrowBinding | null;
  endBinding: ArrowBinding | null;
}

export interface GroupElement extends BaseElement {
  type: 'group';
  label: string;
  color: string;
  memberIds: string[];
  bounds?: Bounds;
}

export const GROUP_COLORS = [
  '#fef3c7',  // Amber 100
  '#d1fae5',  // Green 100
  '#dbeafe',  // Blue 100
  '#fce7f3',  // Pink 100
  '#ede9fe',  // Violet 100
  '#fed7aa',  // Orange 100
  '#e0e7ff',  // Indigo 100
  '#f3e8ff',  // Purple 100
];

export type WBElement = PathElement | RectangleElement | EllipseElement | TextElement | ImageElement | ArrowElement | GroupElement;

export interface Selection {
  elementIds: Set<string>;
}

export interface SnapConfig {
  enabled: boolean;
  gridSize: number;
  threshold: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface SnapGuides {
  horizontal: number[];
  vertical: number[];
  snappedPoint: Point;
}

export interface ThemeConfig {
  background: string;
  gridDot: string;
  selectionStroke: string;
  selectionDash: string;
  snapGuide: string;
  snapHighlight: string;
  marqueeFill: string;
  marqueeStroke: string;
}

export const LIGHT_THEME: ThemeConfig = {
  background: '#ffffff',
  gridDot: '#d1d5db',
  selectionStroke: '#3b82f6',
  selectionDash: '#3b82f6',
  snapGuide: '#f87171',
  snapHighlight: '#3b82f6',
  marqueeFill: 'rgba(59, 130, 246, 0.05)',
  marqueeStroke: '#3b82f6',
};

export const DARK_THEME: ThemeConfig = {
  background: '#1e1e1e',
  gridDot: '#3a3a3a',
  selectionStroke: '#60a5fa',
  selectionDash: '#60a5fa',
  snapGuide: '#fb7185',
  snapHighlight: '#60a5fa',
  marqueeFill: 'rgba(96, 165, 250, 0.08)',
  marqueeStroke: '#60a5fa',
};

export interface WhiteboardState {
  version: string;
  elements: WBElement[];
  viewport: ViewportState;
  toolColor: string;
  toolStrokeWidth: number;
  toolArrowStart: boolean;
  toolArrowEnd: boolean;
  snapEnabled: boolean;
  themeMode: 'light' | 'dark';
}

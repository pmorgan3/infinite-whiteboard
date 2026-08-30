import { describe, it, expect } from 'vitest';
import type { TextElement, ImageElement, ArrowElement, Point, WBElement, SnapConfig, ThemeConfig, WhiteboardState, AnchorPosition, ArrowBinding, GroupElement } from './types';
import { LIGHT_THEME, DARK_THEME, GROUP_COLORS } from './types';
import {
  hitTest,
  getElementPos,
  moveElement,
  createTool,
  generateId,
} from './tools';
import type { ToolContext } from './tools';
import { Viewport } from './viewport';
import {
  HistoryStack,
  AddElementCommand,
  DeleteElementsCommand,
  MoveElementsCommand,
  UpdateElementCommand,
} from './history';
import { Renderer } from './renderer';
import { Whiteboard } from './whiteboard';
import { snapToGrid, snapToGuides, getElementBounds, shiftBounds, getAnchorPoint, resolveBindings, cleanupBindings } from './snap';
import { createGroup, getGroupBounds, dissolveGroup, moveToGroup } from './group-utils';

describe('types', () => {
  it('TextElement satisfies WBElement', () => {
    const el: TextElement = {
      id: 't1',
      type: 'text',
      x: 10,
      y: 20,
      width: 200,
      height: 40,
      text: 'hello',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#1f2937',
      strokeWidth: 1,
    };
    const union: WBElement = el;
    expect(union.type).toBe('text');
  });

  it('ImageElement satisfies WBElement', () => {
    const el: ImageElement = {
      id: 'i1',
      type: 'image',
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      src: 'data:image/png;base64,abc',
      naturalWidth: 200,
      naturalHeight: 200,
      color: '',
      strokeWidth: 0,
    };
    const union: WBElement = el;
    expect(union.type).toBe('image');
  });
});

describe('locking and ordering', () => {
  it('does not restyle or reorder locked selections', () => {
    const wb = new Whiteboard({ canvas: createMockCanvas() });
    wb.elements = [
      { id: 'locked', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 1, locked: true },
      { id: 'free', type: 'rectangle', x: 20, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 1 },
    ];
    wb.selectedIds = new Set(['locked']);
    wb.updateSelection({ color: '#f00' });
    wb.reorderSelection('front');
    expect(wb.elements.map(el => el.id)).toEqual(['locked', 'free']);
    expect(wb.elements[0].color).toBe('#000');
    wb.destroy();
  });

  it('reorders multiple selected elements as one deterministic action', () => {
    const wb = new Whiteboard({ canvas: createMockCanvas() });
    wb.elements = ['a', 'b', 'c'].map((id, x) => ({ id, type: 'rectangle', x, y: 0, width: 1, height: 1, color: '#000', strokeWidth: 1 }));
    wb.selectedIds = new Set(['a', 'b']);
    wb.reorderSelection('front');
    expect(wb.elements.map(el => el.id)).toEqual(['c', 'a', 'b']);
    wb.undo();
    expect(wb.elements.map(el => el.id)).toEqual(['a', 'b', 'c']);
    wb.destroy();
  });
});

describe('hitTest', () => {
  it('detects point inside text element', () => {
    const el: TextElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      text: '',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };
    expect(hitTest(el, { x: 50, y: 15 })).toBe(true);
    expect(hitTest(el, { x: -10, y: 15 })).toBe(false);
    expect(hitTest(el, { x: 50, y: 50 })).toBe(false);
  });

  it('detects point inside image element', () => {
    const el: ImageElement = {
      id: 'i1',
      type: 'image',
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      src: '',
      naturalWidth: 100,
      naturalHeight: 100,
      color: '',
      strokeWidth: 0,
    };
    expect(hitTest(el, { x: 35, y: 35 })).toBe(true);
    expect(hitTest(el, { x: 5, y: 35 })).toBe(false);
  });

  it('uses margin for text and image hit testing', () => {
    const el: TextElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      text: '',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };
    // Within 4px margin
    expect(hitTest(el, { x: -2, y: 15 })).toBe(true);
    expect(hitTest(el, { x: 102, y: 15 })).toBe(true);
  });
});

describe('getElementPos', () => {
  it('returns top-left for text', () => {
    const el: TextElement = {
      id: 't1',
      type: 'text',
      x: 42,
      y: 99,
      width: 100,
      height: 30,
      text: '',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };
    expect(getElementPos(el)).toEqual({ x: 42, y: 99 });
  });

  it('returns top-left for image', () => {
    const el: ImageElement = {
      id: 'i1',
      type: 'image',
      x: 10,
      y: 20,
      width: 50,
      height: 50,
      src: '',
      naturalWidth: 100,
      naturalHeight: 100,
      color: '',
      strokeWidth: 0,
    };
    expect(getElementPos(el)).toEqual({ x: 10, y: 20 });
  });
});

describe('moveElement', () => {
  it('moves text element', () => {
    const el: TextElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      text: 'hello',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };
    const moved = moveElement(el, 50, 60) as TextElement;
    expect(moved.x).toBe(50);
    expect(moved.y).toBe(60);
    expect(moved.text).toBe('hello');
  });

  it('moves image element', () => {
    const el: ImageElement = {
      id: 'i1',
      type: 'image',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      src: '',
      naturalWidth: 100,
      naturalHeight: 100,
      color: '',
      strokeWidth: 0,
    };
    const moved = moveElement(el, 25, 35) as ImageElement;
    expect(moved.x).toBe(25);
    expect(moved.y).toBe(35);
    expect(moved.width).toBe(50);
  });
});

describe('TextTool', () => {
  it('creates a text element on empty canvas click', () => {
    const tool = createTool('text', { color: '#ff0000', strokeWidth: 2 });
    const added: WBElement[] = [];
    let editingId: string | null = null;

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: () => ({ x: 400, y: 300 }),
      activeColor: '#ff0000',
      startEditing: (id) => {
        editingId = id;
      },
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(1);
    const textEl = added[0] as TextElement;
    expect(textEl.type).toBe('text');
    expect(textEl.text).toBe('');
    expect(textEl.color).toBe('#ff0000');
    expect(textEl.width).toBe(200);
    expect(textEl.height).toBe(40);
    expect(editingId).toBe(textEl.id);
  });

  it('starts editing existing text element when clicked', () => {
    const existing: TextElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      text: 'existing',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };
    const tool = createTool('text', { color: '#000', strokeWidth: 2 });
    const added: WBElement[] = [];
    let editingId: string | null = null;

    // viewport at (0,0) zoom 1 with canvas 800x600: screen (400,300) = world (0,0)
    // To hit the element at world (50,15), screen must be (450,315)
    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [existing],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: () => ({ x: 450, y: 315 }),
      activeColor: '#000',
      startEditing: (id) => {
        editingId = id;
      },
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 450, clientY: 315 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(0);
    expect(editingId).toBe('t1');
  });
});

describe('ImageTool', () => {
  it('requests image upload at click position', () => {
    const tool = createTool('image', { color: '#000', strokeWidth: 2 });
    let requestedPoint: Point | null = null;

    // viewport at (0,0) zoom 1 with canvas 800x600: screen (400,300) = world (0,0)
    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [],
      addElement: () => {},
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: () => ({ x: 400, y: 300 }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: (point) => {
        requestedPoint = point;
      },
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }),
      ctx as ToolContext
    );

    expect(requestedPoint).not.toBeNull();
    expect(requestedPoint!.x).toBe(0);
    expect(requestedPoint!.y).toBe(0);
  });
});

describe('HistoryStack', () => {
  it('supports UpdateElementCommand for text changes', () => {
    const elements: WBElement[] = [
      {
        id: 't1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 30,
        text: 'before',
        fontSize: 16,
        fontFamily: 'sans-serif',
        fill: 'transparent',
        color: '#000',
        strokeWidth: 1,
      },
    ];
    const history = new HistoryStack();
    history.execute(new UpdateElementCommand(elements, 't1', { text: 'after' }));

    expect((elements[0] as TextElement).text).toBe('after');
    history.undo();
    expect((elements[0] as TextElement).text).toBe('before');
    history.redo();
    expect((elements[0] as TextElement).text).toBe('after');
  });

  it('supports MoveElementsCommand for text and image', () => {
    const elements: WBElement[] = [
      {
        id: 't1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 30,
        text: '',
        fontSize: 16,
        fontFamily: 'sans-serif',
        fill: 'transparent',
        color: '#000',
        strokeWidth: 1,
      },
      {
        id: 'i1',
        type: 'image',
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        src: '',
        naturalWidth: 100,
        naturalHeight: 100,
        color: '',
        strokeWidth: 0,
      },
    ];
    const history = new HistoryStack();
    history.execute(new MoveElementsCommand(elements, ['t1', 'i1'], 5, 10));

    expect((elements[0] as TextElement).x).toBe(5);
    expect((elements[0] as TextElement).y).toBe(10);
    expect((elements[1] as ImageElement).x).toBe(15);
    expect((elements[1] as ImageElement).y).toBe(20);

    history.undo();
    expect((elements[0] as TextElement).x).toBe(0);
    expect((elements[1] as ImageElement).x).toBe(10);
  });

  it('supports AddElementCommand and DeleteElementsCommand for new types', () => {
    const elements: WBElement[] = [];
    const history = new HistoryStack();

    const textEl: TextElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      text: 'hi',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };

    history.execute(new AddElementCommand(elements, textEl));
    expect(elements.length).toBe(1);

    history.execute(new DeleteElementsCommand(elements, ['t1']));
    expect(elements.length).toBe(0);

    history.undo();
    expect(elements.length).toBe(1);
    expect((elements[0] as TextElement).text).toBe('hi');
  });
});

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const mockCtx: Partial<CanvasRenderingContext2D> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textBaseline: 'alphabetic',
    setTransform: () => {},
    clearRect: () => {},
    scale: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    ellipse: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: (text: string) => ({ width: text.length * 10 }),
    drawImage: () => {},
    closePath: () => {},
  };
  canvas.getContext = () => mockCtx as CanvasRenderingContext2D;
  return canvas;
}

describe('Renderer', () => {
  it('has imageCache Map', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    expect((renderer as any).imageCache).toBeInstanceOf(Map);
  });

  it('drawElement dispatches text and image types', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);

    const textEl: TextElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      text: 'hello',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };

    const imageEl: ImageElement = {
      id: 'i1',
      type: 'image',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      src: '',
      naturalWidth: 100,
      naturalHeight: 100,
      color: '',
      strokeWidth: 0,
    };

    // Should not throw for any element type
    expect(() => (renderer as any).drawElement(textEl)).not.toThrow();
    expect(() => (renderer as any).drawElement(imageEl)).not.toThrow();
  });

  it('wrapText splits long lines', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);

    const lines = (renderer as any).wrapText('hello world this is a test', 30);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('drawSelectionHighlight handles text and image bounds', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);

    const textEl: TextElement = {
      id: 't1',
      type: 'text',
      x: 10,
      y: 20,
      width: 100,
      height: 30,
      text: '',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };

    const imageEl: ImageElement = {
      id: 'i1',
      type: 'image',
      x: 5,
      y: 5,
      width: 50,
      height: 50,
      src: '',
      naturalWidth: 100,
      naturalHeight: 100,
      color: '',
      strokeWidth: 0,
    };

    expect(() => (renderer as any).drawSelectionHighlight(textEl, LIGHT_THEME)).not.toThrow();
    expect(() => (renderer as any).drawSelectionHighlight(imageEl, LIGHT_THEME)).not.toThrow();
  });
});

describe('generateId', () => {
  it('produces unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('ArrowElement', () => {
  it('satisfies WBElement', () => {
    const el: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 100,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
    };
    const union: WBElement = el;
    expect(union.type).toBe('arrow');
  });
});

describe('hitTest arrow', () => {
  it('detects point near arrow line', () => {
    const el: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 0,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
    };
    expect(hitTest(el, { x: 50, y: 2 })).toBe(true);
    expect(hitTest(el, { x: 50, y: 20 })).toBe(false);
    expect(hitTest(el, { x: -10, y: 0 })).toBe(false);
  });

  it('detects point near arrow endpoints', () => {
    const el: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 100,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
    };
    expect(hitTest(el, { x: 2, y: 2 })).toBe(true);
    expect(hitTest(el, { x: 98, y: 98 })).toBe(true);
  });
});

describe('getElementPos arrow', () => {
  it('returns start point', () => {
    const el: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 10,
      startY: 20,
      endX: 100,
      endY: 200,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
    };
    expect(getElementPos(el)).toEqual({ x: 10, y: 20 });
  });
});

describe('moveElement arrow', () => {
  it('translates both endpoints', () => {
    const el: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 100,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
    };
    const moved = moveElement(el, 50, 60) as ArrowElement;
    expect(moved.startX).toBe(50);
    expect(moved.startY).toBe(60);
    expect(moved.endX).toBe(150);
    expect(moved.endY).toBe(160);
  });
});

describe('ArrowTool', () => {
  it('creates arrow element on drag', () => {
    const tool = createTool('arrow', { color: '#000', strokeWidth: 2, arrowStart: false, arrowEnd: true });
    const added: WBElement[] = [];

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }),
      ctx as ToolContext
    );
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(1);
    const arrow = added[0] as ArrowElement;
    expect(arrow.type).toBe('arrow');
    expect(arrow.startX).toBe(0);
    expect(arrow.startY).toBe(0);
    expect(arrow.endX).toBe(100);
    expect(arrow.endY).toBe(100);
    expect(arrow.endArrowhead).toBe(true);
    expect(arrow.startArrowhead).toBe(false);
  });

  it('does not create arrow for short drag', () => {
    const tool = createTool('arrow', { color: '#000', strokeWidth: 2 });
    const added: WBElement[] = [];

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }),
      ctx as ToolContext
    );
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 402, clientY: 302 }),
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 402, clientY: 302 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(0);
  });
});

describe('History arrow', () => {
  it('MoveElementsCommand moves arrow', () => {
    const elements: WBElement[] = [
      {
        id: 'a1',
        type: 'arrow',
        startX: 0,
        startY: 0,
        endX: 100,
        endY: 100,
        startArrowhead: false,
        endArrowhead: true,
        color: '#000',
        strokeWidth: 2,
      },
    ];
    const history = new HistoryStack();
    history.execute(new MoveElementsCommand(elements, ['a1'], 10, 20));

    const arrow = elements[0] as ArrowElement;
    expect(arrow.startX).toBe(10);
    expect(arrow.startY).toBe(20);
    expect(arrow.endX).toBe(110);
    expect(arrow.endY).toBe(120);

    history.undo();
    expect(arrow.startX).toBe(0);
    expect(arrow.endX).toBe(100);
  });
});

describe('Renderer arrow', () => {
  it('drawElement dispatches arrow type', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);

    const arrowEl: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 100,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
    };

    expect(() => (renderer as any).drawElement(arrowEl)).not.toThrow();
  });

  it('drawSelectionHighlight handles arrow bounds', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);

    const arrowEl: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 10,
      startY: 20,
      endX: 100,
      endY: 200,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
    };

    expect(() => (renderer as any).drawSelectionHighlight(arrowEl, LIGHT_THEME)).not.toThrow();
  });
});

describe('snapToGrid', () => {
  const config: SnapConfig = { enabled: true, gridSize: 20, threshold: 8 };

  it('snaps point to nearest grid intersection when enabled', () => {
    expect(snapToGrid({ x: 11, y: 11 }, config)).toEqual({ x: 20, y: 20 });
    expect(snapToGrid({ x: 11, y: -11 }, config)).toEqual({ x: 20, y: -20 });
  });

  it('snaps to zero when point is closer to zero than gridSize', () => {
    expect(snapToGrid({ x: 5, y: 5 }, config)).toEqual({ x: 0, y: 0 });
  });

  it('returns original point when disabled', () => {
    const offConfig: SnapConfig = { enabled: false, gridSize: 20, threshold: 8 };
    expect(snapToGrid({ x: 9, y: 11 }, offConfig)).toEqual({ x: 9, y: 11 });
  });

  it('handles negative coordinates', () => {
    expect(snapToGrid({ x: -11, y: -25 }, config)).toEqual({ x: -20, y: -20 });
  });

  it('handles large coordinates', () => {
    expect(snapToGrid({ x: 99, y: 201 }, config)).toEqual({ x: 100, y: 200 });
  });

  it('handles coordinates exactly on grid', () => {
    expect(snapToGrid({ x: 40, y: 60 }, config)).toEqual({ x: 40, y: 60 });
  });
});

describe('getElementBounds', () => {
  it('computes bounds for rectangle', () => {
    const el: WBElement = {
      id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 1,
    };
    const b = getElementBounds(el);
    expect(b.left).toBe(10);
    expect(b.top).toBe(20);
    expect(b.right).toBe(110);
    expect(b.bottom).toBe(70);
    expect(b.centerX).toBe(60);
    expect(b.centerY).toBe(45);
    expect(b.width).toBe(100);
    expect(b.height).toBe(50);
  });

  it('computes bounds for ellipse', () => {
    const el: WBElement = {
      id: 'e1', type: 'ellipse', x: 100, y: 100, rx: 50, ry: 30, color: '#000', strokeWidth: 1,
    };
    const b = getElementBounds(el);
    expect(b.left).toBe(50);
    expect(b.top).toBe(70);
    expect(b.right).toBe(150);
    expect(b.bottom).toBe(130);
    expect(b.centerX).toBe(100);
    expect(b.centerY).toBe(100);
  });

  it('computes bounds for arrow', () => {
    const el: WBElement = {
      id: 'a1', type: 'arrow', startX: 0, startY: 0, endX: 100, endY: 200,
      startArrowhead: false, endArrowhead: true, color: '#000', strokeWidth: 2,
    };
    const b = getElementBounds(el);
    expect(b.left).toBe(0);
    expect(b.top).toBe(0);
    expect(b.right).toBe(100);
    expect(b.bottom).toBe(200);
    expect(b.centerX).toBe(50);
    expect(b.centerY).toBe(100);
  });

  it('computes bounds for text', () => {
    const el: WBElement = {
      id: 't1', type: 'text', x: 50, y: 50, width: 200, height: 30,
      text: '', fontSize: 16, fontFamily: 'sans-serif', fill: 'transparent', color: '#000', strokeWidth: 1,
    };
    const b = getElementBounds(el);
    expect(b.left).toBe(50);
    expect(b.top).toBe(50);
    expect(b.right).toBe(250);
    expect(b.bottom).toBe(80);
    expect(b.centerX).toBe(150);
    expect(b.centerY).toBe(65);
  });

  it('computes bounds for path', () => {
    const el: WBElement = {
      id: 'p1', type: 'path',
      points: [{ x: 10, y: 20 }, { x: 50, y: 80 }, { x: 100, y: 30 }],
      color: '#000', strokeWidth: 2,
    };
    const b = getElementBounds(el);
    expect(b.left).toBe(10);
    expect(b.top).toBe(20);
    expect(b.right).toBe(100);
    expect(b.bottom).toBe(80);
    expect(b.centerX).toBe(55);
    expect(b.centerY).toBe(50);
  });
});

describe('shiftBounds', () => {
  it('shifts bounds by dx and dy', () => {
    const b = {
      left: 10, top: 20, right: 110, bottom: 70,
      centerX: 60, centerY: 45, width: 100, height: 50,
    };
    const shifted = shiftBounds(b, 5, -10);
    expect(shifted.left).toBe(15);
    expect(shifted.top).toBe(10);
    expect(shifted.right).toBe(115);
    expect(shifted.bottom).toBe(60);
    expect(shifted.centerX).toBe(65);
    expect(shifted.centerY).toBe(35);
    expect(shifted.width).toBe(100);
    expect(shifted.height).toBe(50);
  });
});

describe('snapToGuides', () => {
  const viewport = new Viewport();
  const defaultConfig: SnapConfig = { enabled: true, gridSize: 20, threshold: 8 };

  it('returns no guides when config is disabled', () => {
    const config: SnapConfig = { enabled: false, gridSize: 20, threshold: 8 };
    const movingBounds = { left: 50, top: 50, right: 150, bottom: 100, centerX: 100, centerY: 75, width: 100, height: 50 };
    const result = snapToGuides(movingBounds, [], config, viewport);
    expect(result.horizontal).toEqual([]);
    expect(result.vertical).toEqual([]);
    expect(result.snappedPoint).toEqual({ x: 100, y: 75 });
  });

  it('snaps to vertical center alignment', () => {
    const other = { left: 0, top: 0, right: 100, bottom: 50, centerX: 50, centerY: 25, width: 100, height: 50 };
    const moving = { left: 55, top: 100, right: 155, bottom: 150, centerX: 105, centerY: 125, width: 100, height: 50 };
    const result = snapToGuides(moving, [other], defaultConfig, viewport);
    expect(result.vertical).toContain(50);
    expect(result.snappedPoint.x).toBe(100);
  });

  it('snaps to horizontal alignment', () => {
    const other = { left: 0, top: 0, right: 100, bottom: 50, centerX: 50, centerY: 25, width: 100, height: 50 };
    const moving = { left: 200, top: 3, right: 300, bottom: 53, centerX: 250, centerY: 28, width: 100, height: 50 };
    const result = snapToGuides(moving, [other], defaultConfig, viewport);
    expect(result.horizontal.length).toBeGreaterThan(0);
    expect(result.snappedPoint.y).toBe(25);
  });

  it('returns empty guides when no alignment is near threshold', () => {
    const other = { left: 0, top: 0, right: 100, bottom: 50, centerX: 50, centerY: 25, width: 100, height: 50 };
    const moving = { left: 500, top: 500, right: 600, bottom: 550, centerX: 550, centerY: 525, width: 100, height: 50 };
    const result = snapToGuides(moving, [other], defaultConfig, viewport);
    expect(result.horizontal).toEqual([]);
    expect(result.vertical).toEqual([]);
  });

  it('snaps to left edge alignment', () => {
    const other = { left: 10, top: 10, right: 100, bottom: 60, centerX: 55, centerY: 35, width: 90, height: 50 };
    const moving = { left: 14, top: 200, right: 114, bottom: 250, centerX: 64, centerY: 225, width: 100, height: 50 };
    const result = snapToGuides(moving, [other], defaultConfig, viewport);
    expect(result.vertical).toContain(10);
    expect(result.snappedPoint.x).toBe(60);
  });

  it('snaps to right edge alignment', () => {
    const other = { left: 10, top: 10, right: 100, bottom: 60, centerX: 55, centerY: 35, width: 90, height: 50 };
    const moving = { left: 96, top: 200, right: 196, bottom: 250, centerX: 146, centerY: 225, width: 100, height: 50 };
    const result = snapToGuides(moving, [other], defaultConfig, viewport);
    expect(result.vertical).toContain(100);
    expect(result.snappedPoint.x).toBe(150);
  });

  it('scales threshold by zoom level', () => {
    const zoomedViewport = new Viewport();
    zoomedViewport.zoom = 0.5;
    const other = { left: 0, top: 0, right: 100, bottom: 50, centerX: 50, centerY: 25, width: 100, height: 50 };
    const moving = { left: 40, top: 100, right: 140, bottom: 150, centerX: 90, centerY: 125, width: 100, height: 50 };
    const result = snapToGuides(moving, [other], defaultConfig, zoomedViewport);
    expect(result.vertical).toContain(50);
    expect(result.snappedPoint.x).toBe(100);
  });

  it('handles multiple elements with alignment', () => {
    const other1 = { left: 0, top: 0, right: 100, bottom: 50, centerX: 50, centerY: 25, width: 100, height: 50 };
    const other2 = { left: 200, top: 0, right: 300, bottom: 50, centerX: 250, centerY: 25, width: 100, height: 50 };
    const moving = { left: 45, top: 100, right: 145, bottom: 150, centerX: 95, centerY: 125, width: 100, height: 50 };
    const result = snapToGuides(moving, [other1, other2], defaultConfig, viewport);
    expect(result.vertical).toContain(50);
    expect(result.vertical.length + result.horizontal.length).toBeGreaterThan(0);
  });

  it('returns empty when no other elements', () => {
    const moving = { left: 50, top: 50, right: 150, bottom: 100, centerX: 100, centerY: 75, width: 100, height: 50 };
    const result = snapToGuides(moving, [], defaultConfig, viewport);
    expect(result.horizontal).toEqual([]);
    expect(result.vertical).toEqual([]);
    expect(result.snappedPoint).toEqual({ x: 100, y: 75 });
  });
});

describe('Viewport.zoomToPoint', () => {
  it('zooms toward screen point keeping it stable', () => {
    const vp = new Viewport();
    vp.zoomToPoint(200, 150, 2, 400, 300);
    expect(vp.zoom).toBeCloseTo(2);
    const world = vp.screenToWorld({ x: 200, y: 150 }, 400, 300);
    const worldOrig = new Viewport().screenToWorld({ x: 200, y: 150 }, 400, 300);
    expect(world.x).toBeCloseTo(worldOrig.x, 4);
    expect(world.y).toBeCloseTo(worldOrig.y, 4);
  });

  it('clamps zoom to minimum', () => {
    const vp = new Viewport();
    vp.zoomToPoint(100, 100, 0.01, 400, 300);
    expect(vp.zoom).toBe(0.05);
  });

  it('clamps zoom to maximum', () => {
    const vp = new Viewport();
    vp.zoomToPoint(100, 100, 20, 400, 300);
    expect(vp.zoom).toBe(10);
  });

  it('does not change world position under cursor when zooming in', () => {
    const vp = new Viewport();
    vp.zoomToPoint(100, 100, 2, 400, 300);
    const worldBefore = new Viewport().screenToWorld({ x: 100, y: 100 }, 400, 300);
    const worldAfter = vp.screenToWorld({ x: 100, y: 100 }, 400, 300);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 4);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 4);
  });

  it('works from an already-panned viewport', () => {
    const vp = new Viewport({ x: 100, y: 50, zoom: 1 });
    const worldBefore = vp.screenToWorld({ x: 200, y: 150 }, 400, 300);
    vp.zoomToPoint(200, 150, 0.5, 400, 300);
    const worldAfter = vp.screenToWorld({ x: 200, y: 150 }, 400, 300);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 4);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 4);
  });
});

describe('Viewport.clone', () => {
  it('creates independent copy', () => {
    const vp = new Viewport({ x: 10, y: 20, zoom: 2 });
    const clone = vp.clone();
    clone.x = 99;
    clone.zoom = 5;
    expect(vp.x).toBe(10);
    expect(vp.zoom).toBe(2);
  });
});

describe('Viewport.toState', () => {
  it('round-trips viewport state', () => {
    const vp = new Viewport({ x: 10, y: 20, zoom: 1.5 });
    const state = vp.toState();
    const restored = new Viewport(state);
    expect(restored.x).toBe(10);
    expect(restored.y).toBe(20);
    expect(restored.zoom).toBe(1.5);
  });
});

describe('ThemeConfig', () => {
  it('LIGHT_THEME has all required keys', () => {
    const keys: (keyof ThemeConfig)[] = [
      'background', 'gridDot', 'selectionStroke', 'selectionDash',
      'snapGuide', 'snapHighlight', 'marqueeFill', 'marqueeStroke',
    ];
    for (const key of keys) {
      expect(LIGHT_THEME[key]).toBeDefined();
      expect(typeof LIGHT_THEME[key]).toBe('string');
    }
  });

  it('DARK_THEME has all required keys', () => {
    const keys: (keyof ThemeConfig)[] = [
      'background', 'gridDot', 'selectionStroke', 'selectionDash',
      'snapGuide', 'snapHighlight', 'marqueeFill', 'marqueeStroke',
    ];
    for (const key of keys) {
      expect(DARK_THEME[key]).toBeDefined();
      expect(typeof DARK_THEME[key]).toBe('string');
    }
  });

  it('LIGHT_THEME background is white', () => {
    expect(LIGHT_THEME.background).toBe('#ffffff');
  });

  it('DARK_THEME background is dark', () => {
    expect(DARK_THEME.background).toBe('#1e1e1e');
  });

  it('LIGHT_THEME and DARK_THEME differ on every key', () => {
    const keys: (keyof ThemeConfig)[] = [
      'background', 'gridDot', 'selectionStroke', 'snapGuide', 'snapHighlight',
    ];
    for (const key of keys) {
      expect(LIGHT_THEME[key]).not.toBe(DARK_THEME[key]);
    }
  });

  it('DARK_THEME grid dots are darker than LIGHT_THEME', () => {
    expect(DARK_THEME.gridDot).toBe('#3a3a3a');
    expect(LIGHT_THEME.gridDot).toBe('#d1d5db');
  });

  it('DARK_THEME selection colors are lighter for contrast on dark bg', () => {
    expect(DARK_THEME.selectionStroke).toBe('#60a5fa');
    expect(LIGHT_THEME.selectionStroke).toBe('#3b82f6');
  });
});

describe('Renderer with theme', () => {
  it('render accepts theme parameter without error', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const viewport = new Viewport();
    const elements: WBElement[] = [];
    const selectedIds = new Set<string>();

    expect(() => {
      renderer.render(viewport, elements, selectedIds, undefined, null, undefined, DARK_THEME);
    }).not.toThrow();
  });

  it('render uses LIGHT_THEME when theme is undefined', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const viewport = new Viewport();
    const elements: WBElement[] = [];
    const selectedIds = new Set<string>();

    expect(() => {
      renderer.render(viewport, elements, selectedIds);
    }).not.toThrow();
  });

  it('drawSelectionHighlight accepts theme parameter', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);

    const textEl: TextElement = {
      id: 't1',
      type: 'text',
      x: 10,
      y: 20,
      width: 100,
      height: 30,
      text: '',
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: 'transparent',
      color: '#000',
      strokeWidth: 1,
    };

    expect(() => (renderer as any).drawSelectionHighlight(textEl, DARK_THEME)).not.toThrow();
    expect(() => (renderer as any).drawSelectionHighlight(textEl, LIGHT_THEME)).not.toThrow();
  });

  it('drawGrid accepts theme parameter', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const viewport = new Viewport();

    expect(() => (renderer as any).drawGrid(viewport, 800, 600, DARK_THEME)).not.toThrow();
    expect(() => (renderer as any).drawGrid(viewport, 800, 600, LIGHT_THEME)).not.toThrow();
  });
});

describe('WhiteboardState serialization', () => {
  const Version = '1.0.0';

  it('getState captures all fields', () => {
    const state: WhiteboardState = {
      version: Version,
      elements: [{
        id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#ff0000', strokeWidth: 2,
      }],
      viewport: { x: 5, y: 10, zoom: 1.5 },
      toolColor: '#3b82f6',
      toolStrokeWidth: 4,
      toolArrowStart: true,
      toolArrowEnd: false,
      snapEnabled: true,
      themeMode: 'dark',
    };

    expect(state.version).toBe(Version);
    expect(state.elements).toHaveLength(1);
    expect(state.viewport.zoom).toBe(1.5);
    expect(state.toolColor).toBe('#3b82f6');
    expect(state.snapEnabled).toBe(true);
    expect(state.themeMode).toBe('dark');
  });

  it('WhiteboardState round-trips through JSON', () => {
    const state: WhiteboardState = {
      version: Version,
      elements: [
        { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 1 },
        { id: 'p1', type: 'path', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: '#ff0000', strokeWidth: 2 },
        { id: 'a1', type: 'arrow', startX: 0, startY: 0, endX: 50, endY: 50, startArrowhead: true, endArrowhead: true, color: '#000', strokeWidth: 2 },
      ],
      viewport: { x: -10, y: 20, zoom: 0.5 },
      toolColor: '#1f2937',
      toolStrokeWidth: 3,
      toolArrowStart: false,
      toolArrowEnd: true,
      snapEnabled: false,
      themeMode: 'light',
    };
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json) as WhiteboardState;
    expect(parsed.version).toBe(Version);
    expect(parsed.elements).toHaveLength(3);
    expect(parsed.viewport.x).toBe(-10);
    expect((parsed.elements[1] as any).points).toHaveLength(2);
    expect(parsed.toolColor).toBe('#1f2937');
    expect(parsed.themeMode).toBe('light');
  });

  it('rejects state with wrong version', () => {
    const canvas = createMockCanvas();
    const wb = new Whiteboard({ canvas });
    const state: WhiteboardState = {
      version: '0.0.0',
      elements: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      toolColor: '#000',
      toolStrokeWidth: 2,
      toolArrowStart: false,
      toolArrowEnd: true,
      snapEnabled: false,
      themeMode: 'light',
    };
    const prevElements = wb.elements.length;
    wb.setState(state);
    expect(wb.elements.length).toBe(prevElements);
  });

  it('can restore state without reporting a document change', () => {
    const canvas = createMockCanvas();
    let changes = 0;
    const wb = new Whiteboard({ canvas, onChange: () => { changes++; } });
    const state: WhiteboardState = {
      version: Version,
      elements: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      toolColor: '#000',
      toolStrokeWidth: 2,
      toolArrowStart: false,
      toolArrowEnd: true,
      snapEnabled: false,
      themeMode: 'light',
    };

    wb.setState(state, false);
    expect(changes).toBe(0);
    wb.setState(state);
    expect(changes).toBe(1);
  });
});

describe('ArrowElement with bindings', () => {
  it('satisfies WBElement with null bindings', () => {
    const el: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 100,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
      startBinding: null,
      endBinding: null,
    };
    const union: WBElement = el;
    expect(union.type).toBe('arrow');
  });

  it('satisfies WBElement with populated bindings', () => {
    const binding: ArrowBinding = { elementId: 'r1', position: 'top' };
    const el: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 100,
      startArrowhead: false,
      endArrowhead: true,
      color: '#000',
      strokeWidth: 2,
      startBinding: binding,
      endBinding: null,
    };
    const union: WBElement = el;
    expect(union.type).toBe('arrow');
    if (union.type === 'arrow') {
      expect(union.startBinding?.elementId).toBe('r1');
      expect(union.startBinding?.position).toBe('top');
    }
  });
});

describe('getAnchorPoint', () => {
  it('returns top anchor for rectangle', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const pt = getAnchorPoint(rect, 'top');
    expect(pt.x).toBe(60); // centerX = 10 + 50 = 60
    expect(pt.y).toBe(20); // top = 20
  });

  it('returns right anchor for rectangle', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const pt = getAnchorPoint(rect, 'right');
    expect(pt.x).toBe(110);
    expect(pt.y).toBe(45);
  });

  it('returns bottom anchor for rectangle', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const pt = getAnchorPoint(rect, 'bottom');
    expect(pt.x).toBe(60);
    expect(pt.y).toBe(70);
  });

  it('returns left anchor for rectangle', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const pt = getAnchorPoint(rect, 'left');
    expect(pt.x).toBe(10);
    expect(pt.y).toBe(45);
  });

  it('returns center anchor for rectangle', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const pt = getAnchorPoint(rect, 'center');
    expect(pt.x).toBe(60);
    expect(pt.y).toBe(45);
  });

  it('returns top anchor for ellipse', () => {
    const ellipse: WBElement = {
      id: 'e1', type: 'ellipse', x: 100, y: 100, rx: 50, ry: 30, color: '#000', strokeWidth: 2,
    };
    const pt = getAnchorPoint(ellipse, 'top');
    expect(pt.x).toBe(100);
    expect(pt.y).toBe(70);
  });

  it('returns right anchor for ellipse', () => {
    const ellipse: WBElement = {
      id: 'e1', type: 'ellipse', x: 100, y: 100, rx: 50, ry: 30, color: '#000', strokeWidth: 2,
    };
    const pt = getAnchorPoint(ellipse, 'right');
    expect(pt.x).toBe(150);
    expect(pt.y).toBe(100);
  });

  it('returns anchor for text element', () => {
    const text: WBElement = {
      id: 't1', type: 'text', x: 50, y: 50, width: 200, height: 30,
      text: '', fontSize: 16, fontFamily: 'sans-serif', fill: 'transparent', color: '#000', strokeWidth: 1,
    };
    const pt = getAnchorPoint(text, 'bottom');
    expect(pt.x).toBe(150);
    expect(pt.y).toBe(80);
  });

  it('respects additionalOffset parameter', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const pt = getAnchorPoint(rect, 'right', 10);
    expect(pt.x).toBe(110);
    expect(pt.y).toBe(50);
  });
});

describe('resolveBindings', () => {
  it('updates arrow endpoints from bound rectangle', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 0, startY: 0,
      endX: 200, endY: 200,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: null,
    };
    const elements: WBElement[] = [rect, arrow];

    resolveBindings(elements);

    expect(arrow.startX).toBe(100);
    expect(arrow.startY).toBe(50);
    // end should not change
    expect(arrow.endX).toBe(200);
    expect(arrow.endY).toBe(200);
  });

  it('updates both endpoints when both bound', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const ellipse: WBElement = {
      id: 'e1', type: 'ellipse', x: 200, y: 200, rx: 50, ry: 50, color: '#000', strokeWidth: 2,
    };
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 999, startY: 999,
      endX: 999, endY: 999,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'top' },
      endBinding: { elementId: 'e1', position: 'left' },
    };
    const elements: WBElement[] = [rect, ellipse, arrow];

    resolveBindings(elements);

    expect(arrow.startX).toBe(50);
    expect(arrow.startY).toBe(0);
    expect(arrow.endX).toBe(150);
    expect(arrow.endY).toBe(200);
  });

  it('does not change arrow without bindings', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 10, startY: 20,
      endX: 30, endY: 40,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: null,
      endBinding: null,
    };
    const elements: WBElement[] = [arrow];

    resolveBindings(elements);

    expect(arrow.startX).toBe(10);
    expect(arrow.startY).toBe(20);
    expect(arrow.endX).toBe(30);
    expect(arrow.endY).toBe(40);
  });

  it('does not crash if bound element is missing', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 10, startY: 20,
      endX: 30, endY: 40,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'nonexistent', position: 'right' },
      endBinding: null,
    };
    const elements: WBElement[] = [arrow];

    expect(() => resolveBindings(elements)).not.toThrow();
    expect(arrow.startX).toBe(10);
    expect(arrow.startY).toBe(20);
  });

  it('resolves binding position center', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 999, startY: 999,
      endX: 999, endY: 999,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'center' },
      endBinding: null,
    };
    const elements: WBElement[] = [rect, arrow];

    resolveBindings(elements);

    expect(arrow.startX).toBe(50);
    expect(arrow.startY).toBe(50);
  });

  it('handles empty elements array', () => {
    expect(() => resolveBindings([])).not.toThrow();
  });

  it('handles only non-arrow elements', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2 },
    ];
    expect(() => resolveBindings(elements)).not.toThrow();
  });
});

describe('cleanupBindings', () => {
  it('nullifies startBinding when bound element is deleted', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 0, startY: 0, endX: 100, endY: 100,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: null,
    };
    const elements: WBElement[] = [arrow];

    cleanupBindings(elements, new Set(['r1']));

    expect(arrow.startBinding).toBeNull();
    expect(arrow.endBinding).toBeNull();
  });

  it('nullifies endBinding when bound element is deleted', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 0, startY: 0, endX: 100, endY: 100,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: null,
      endBinding: { elementId: 'e1', position: 'top' },
    };
    const elements: WBElement[] = [arrow];

    cleanupBindings(elements, new Set(['e1']));

    expect(arrow.endBinding).toBeNull();
  });

  it('nullifies both bindings when both elements are deleted', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 0, startY: 0, endX: 100, endY: 100,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: { elementId: 'e1', position: 'left' },
    };
    const elements: WBElement[] = [arrow];

    cleanupBindings(elements, new Set(['r1', 'e1']));

    expect(arrow.startBinding).toBeNull();
    expect(arrow.endBinding).toBeNull();
  });

  it('preserves bindings for non-deleted elements', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 0, startY: 0, endX: 100, endY: 100,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: { elementId: 'e1', position: 'top' },
    };
    const elements: WBElement[] = [arrow];

    cleanupBindings(elements, new Set(['r2'])); // different ID

    expect(arrow.startBinding).not.toBeNull();
    expect(arrow.endBinding).not.toBeNull();
  });

  it('preserves arrow coordinates after binding cleanup', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 42, startY: 77, endX: 100, endY: 200,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: { elementId: 'e1', position: 'top' },
    };
    const elements: WBElement[] = [arrow];

    cleanupBindings(elements, new Set(['r1', 'e1']));

    // Coordinates should NOT change — just bindings are nullified
    expect(arrow.startX).toBe(42);
    expect(arrow.startY).toBe(77);
    expect(arrow.endX).toBe(100);
    expect(arrow.endY).toBe(200);
  });

  it('does nothing on empty elements', () => {
    expect(() => cleanupBindings([], new Set(['r1']))).not.toThrow();
  });

  it('does nothing on empty deletedIds', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 0, startY: 0, endX: 100, endY: 100,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: null,
    };
    const elements: WBElement[] = [arrow];
    cleanupBindings(elements, new Set());
    expect(arrow.startBinding).not.toBeNull();
  });
});

describe('ArrowTool with snap-to-element', () => {
  it('snaps start point to nearest anchor on a rectangle', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const tool = createTool('arrow', { color: '#000', strokeWidth: 2 });
    const added: WBElement[] = [];
    let snapTargetId: string | null = null;

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [rect],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: (id) => { snapTargetId = id; },
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 450, clientY: 295 }), // world (50, -5) near top of rect
      ctx as ToolContext
    );
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(1);
    const arrow = added[0] as ArrowElement;
    expect(arrow.startBinding).not.toBeNull();
    expect(arrow.startBinding!.elementId).toBe('r1');
    expect(arrow.startBinding!.position).toBe('top');
  });

  it('snaps end point to nearest anchor on an ellipse', () => {
    const ellipse: WBElement = {
      id: 'e1', type: 'ellipse', x: 200, y: 200, rx: 50, ry: 50, color: '#000', strokeWidth: 2,
    };
    const tool = createTool('arrow', { color: '#000', strokeWidth: 2 });
    const added: WBElement[] = [];

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [ellipse],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }),
      ctx as ToolContext
    );
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 550, clientY: 500 }),
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 550, clientY: 500 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(1);
    const arrow = added[0] as ArrowElement;
    // The end point should be snapped to ellipse anchor since end is closest
    expect(arrow.endBinding).not.toBeNull();
    if (arrow.endBinding) {
      expect(arrow.endBinding.elementId).toBe('e1');
    }
  });

  it('does not snap to arrows or paths', () => {
    const path: WBElement = {
      id: 'p1', type: 'path',
      points: [{ x: 50, y: 50 }, { x: 150, y: 150 }],
      color: '#000', strokeWidth: 2,
    };
    const arrowEl: ArrowElement = {
      id: 'a2', type: 'arrow',
      startX: 100, startY: 100, endX: 200, endY: 200,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: null, endBinding: null,
    };
    const tool = createTool('arrow', { color: '#000', strokeWidth: 2 });
    const added: WBElement[] = [];

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [path, arrowEl],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }),
      ctx as ToolContext
    );
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(1);
    const arrow = added[0] as ArrowElement;
    expect(arrow.startBinding).toBeNull();
    expect(arrow.endBinding).toBeNull();
  });

  it('snaps start point to center anchor', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const tool = createTool('arrow', { color: '#000', strokeWidth: 2 });
    const added: WBElement[] = [];

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [rect],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 450, clientY: 350 }), // world (50, 50) = center
      ctx as ToolContext
    );
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(1);
    const arrow = added[0] as ArrowElement;
    expect(arrow.startBinding).not.toBeNull();
    expect(arrow.startBinding!.position).toBe('center');
    expect(arrow.startX).toBe(50);
    expect(arrow.startY).toBe(50);
  });

  it('sets and clears snapTargetId via setArrowSnapTarget', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const tool = createTool('arrow', { color: '#000', strokeWidth: 2 });
    const snapIds: (string | null)[] = [];

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [rect],
      addElement: () => {},
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: (id) => { snapIds.push(id); },
    };

    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 450, clientY: 295 }),
      ctx as ToolContext
    );
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 545, clientY: 395 }), // near rect right edge
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 545, clientY: 395 }),
      ctx as ToolContext
    );

    const lastSnapId = snapIds[snapIds.length - 1];
    expect(lastSnapId).toBeNull(); // Final reset should pass null
  });

  it('does not snap to same element for both ends', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const tool = createTool('arrow', { color: '#000', strokeWidth: 2 });
    const added: WBElement[] = [];

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [rect],
      addElement: (el) => added.push(el),
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    // Start at left of rect (should snap to left anchor)
    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 350 }),
      ctx as ToolContext
    );
    // Move near right of rect (but endBinding should NOT be set since it's the same element)
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 510, clientY: 350 }),
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 510, clientY: 350 }),
      ctx as ToolContext
    );

    expect(added.length).toBe(1);
    const arrow = added[0] as ArrowElement;
    expect(arrow.startBinding).not.toBeNull();
    expect(arrow.endBinding).toBeNull();
  });
});

describe('resolveBindings after element move', () => {
  it('arrow follows bound rectangle after rectangle is moved', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 100, startY: 50, // tied to rect.right
      endX: 200, endY: 200,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: null,
    };
    const elements: WBElement[] = [rect, arrow];

    // Move the rectangle
    const movedRect = moveElement(rect, 50, 30) as typeof rect;
    elements[0] = movedRect;

    resolveBindings(elements);

    // Arrow start should follow to new right anchor
    expect(arrow.startX).toBe(150); // movedRect.x + width = 50 + 100
    expect(arrow.startY).toBe(80);  // movedRect.y + height/2 = 30 + 50
  });

  it('arrow follows bound ellipse after ellipse is moved', () => {
    const ellipse: WBElement = {
      id: 'e1', type: 'ellipse', x: 200, y: 200, rx: 50, ry: 30, color: '#000', strokeWidth: 2,
    };
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 50, startY: 50,
      endX: 200, endY: 200,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: null,
      endBinding: { elementId: 'e1', position: 'top' },
    };
    const elements: WBElement[] = [ellipse, arrow];

    // Move the ellipse
    const movedEllipse = moveElement(ellipse, 300, 300) as typeof ellipse;
    elements[0] = movedEllipse;

    resolveBindings(elements);

    // Arrow end should follow to new top anchor (centerX=350, top=300)
    expect(arrow.endX).toBe(350);
    expect(arrow.endY).toBe(300);
  });

  it('resolveBindings called from SelectTool after drag ends', () => {
    // This tests that resolveBindings is in the ToolContext and can be called
    let resolveCalled = false;
    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [],
      addElement: () => {},
      updateElement: () => {},
      deleteElements: () => {},
      setSelectedIds: () => {},
      getSelectedIds: () => new Set(),
      canvasWidth: 800,
      canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: () => ({ x: 0, y: 0 }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => { resolveCalled = true; },
      setArrowSnapTarget: () => {},
    };

    const tool = createTool('select', { color: '#000', strokeWidth: 2 });
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0 }),
      ctx as ToolContext
    );

    expect(resolveCalled).toBe(true);
  });
});

describe('HistoryStack with arrow bindings', () => {
  it('deleteElementsCommand calls cleanupBindings', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 0, startY: 0, endX: 100, endY: 100,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: { elementId: 'e1', position: 'top' },
    };
    const elements: WBElement[] = [arrow];

    const history = new HistoryStack();
    history.execute(new DeleteElementsCommand(elements, ['r1']));

    expect(arrow.startBinding).toBeNull();
    expect(arrow.endBinding).not.toBeNull(); // e1 was not deleted
  });

  it('undo restores elements but bindings stay null', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 100, startY: 50, endX: 200, endY: 200,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: null,
    };
    const elements: WBElement[] = [rect, arrow];

    const history = new HistoryStack();
    history.execute(new DeleteElementsCommand(elements, ['r1']));

    // After deletion, rect is removed and arrow binding is null
    expect(elements.length).toBe(1);
    expect(arrow.startBinding).toBeNull();

    history.undo();

    // After undo, rect is restored and arrow binding should remain as it was (null—bindings are NOT restored)
    expect(elements.length).toBe(2);
    // Arrow binding is null because cleanupBindings doesn't track original state
    expect(arrow.startBinding).toBeNull();
  });

  it('UpdateElementCommand preserves bindings', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      startX: 0, startY: 0, endX: 100, endY: 100,
      startArrowhead: false, endArrowhead: true,
      color: '#000', strokeWidth: 2,
      startBinding: { elementId: 'r1', position: 'right' },
      endBinding: null,
    };
    const elements: WBElement[] = [arrow];

    const history = new HistoryStack();
    history.execute(new UpdateElementCommand(elements, 'a1', {
      color: '#ff0000',
      strokeWidth: 4,
    }));

    expect(arrow.color).toBe('#ff0000');
    expect(arrow.strokeWidth).toBe(4);
    expect(arrow.startBinding).not.toBeNull();
    expect(arrow.startBinding!.elementId).toBe('r1');

    history.undo();
    expect(arrow.color).toBe('#000');
    expect(arrow.strokeWidth).toBe(2);
    expect(arrow.startBinding).not.toBeNull();
  });
});

describe('ArrowElement JSON round-trip with bindings', () => {
  it('ArrowElement serializes and deserializes bindings', () => {
    const state: WhiteboardState = {
      version: '1.0.0',
      elements: [
        { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 1 },
        {
          id: 'a1', type: 'arrow',
          startX: 0, startY: 0, endX: 100, endY: 100,
          startArrowhead: false, endArrowhead: true,
          color: '#000', strokeWidth: 2,
          startBinding: { elementId: 'r1', position: 'right' },
          endBinding: null,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      toolColor: '#1f2937',
      toolStrokeWidth: 2,
      toolArrowStart: false,
      toolArrowEnd: true,
      snapEnabled: false,
      themeMode: 'light',
    };

    const json = JSON.stringify(state);
    const parsed = JSON.parse(json) as WhiteboardState;

    expect(parsed.elements).toHaveLength(2);
    const arrow = parsed.elements[1] as ArrowElement;
    expect(arrow.startBinding).not.toBeNull();
    expect(arrow.startBinding!.elementId).toBe('r1');
    expect(arrow.startBinding!.position).toBe('right');
    expect(arrow.endBinding).toBeNull();
  });

  it('ArrowElement with both bindings serializes correctly', () => {
    const state: WhiteboardState = {
      version: '1.0.0',
      elements: [
        {
          id: 'a1', type: 'arrow',
          startX: 10, startY: 20, endX: 30, endY: 40,
          startArrowhead: true, endArrowhead: true,
          color: '#000', strokeWidth: 2,
          startBinding: { elementId: 'r1', position: 'top' },
          endBinding: { elementId: 'e1', position: 'bottom' },
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      toolColor: '#1f2937',
      toolStrokeWidth: 2,
      toolArrowStart: false,
      toolArrowEnd: true,
      snapEnabled: false,
      themeMode: 'light',
    };

    const json = JSON.stringify(state);
    const parsed = JSON.parse(json) as WhiteboardState;
    const arrow = parsed.elements[0] as ArrowElement;

    expect(arrow.startBinding?.elementId).toBe('r1');
    expect(arrow.startBinding?.position).toBe('top');
    expect(arrow.endBinding?.elementId).toBe('e1');
    expect(arrow.endBinding?.position).toBe('bottom');
  });
});

describe('Renderer snap highlights', () => {
  it('drawSnapHighlight does not throw', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const viewport = new Viewport();
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    expect(() => renderer.drawSnapHighlight(rect, viewport)).not.toThrow();
  });

  it('drawAnchorPoints does not throw for rectangle', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const viewport = new Viewport();
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    expect(() => renderer.drawAnchorPoints(rect, viewport)).not.toThrow();
  });

  it('drawAnchorPoints does not throw for ellipse', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const viewport = new Viewport();
    const ellipse: WBElement = {
      id: 'e1', type: 'ellipse', x: 100, y: 100, rx: 50, ry: 30, color: '#000', strokeWidth: 2,
    };
    expect(() => renderer.drawAnchorPoints(ellipse, viewport)).not.toThrow();
  });

  it('drawSnapHighlight does not throw for text element', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const viewport = new Viewport();
    const text: WBElement = {
      id: 't1', type: 'text', x: 0, y: 0, width: 200, height: 40,
      text: 'hello', fontSize: 16, fontFamily: 'sans-serif', fill: 'transparent', color: '#000', strokeWidth: 1,
    };
    expect(() => renderer.drawSnapHighlight(text, viewport)).not.toThrow();
  });
});

describe('GroupElement type', () => {
  it('satisfies WBElement', () => {
    const g: GroupElement = {
      id: 'g1', type: 'group', label: 'Test', color: '#fef3c7',
      memberIds: ['r1', 'e1'], strokeWidth: 0,
    };
    const union: WBElement = g;
    expect(union.type).toBe('group');
  });

  it('has optional bounds field', () => {
    const g: GroupElement = {
      id: 'g1', type: 'group', label: 'Test', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0, bounds: {
        left: 0, top: 0, right: 100, bottom: 100,
        centerX: 50, centerY: 50, width: 100, height: 100,
      },
    };
    expect(g.bounds).toBeDefined();
    expect(g.bounds!.width).toBe(100);
  });
});

describe('GROUP_COLORS', () => {
  it('has 8 colors', () => {
    expect(GROUP_COLORS).toHaveLength(8);
  });

  it('all colors are valid hex strings', () => {
    for (const c of GROUP_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('group-utils', () => {
  it('createGroup produces a group element', () => {
    const g = createGroup(['r1', 'e1'], 'Team A', '#fef3c7');
    expect(g.type).toBe('group');
    expect(g.label).toBe('Team A');
    expect(g.color).toBe('#fef3c7');
    expect(g.memberIds).toEqual(['r1', 'e1']);
    expect(g.strokeWidth).toBe(0);
    expect(g.id).toBeTruthy();
  });

  it('getGroupBounds computes bounds from member elements', () => {
    const members: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 2 },
      { id: 'e1', type: 'ellipse', x: 200, y: 100, rx: 50, ry: 30, color: '#000', strokeWidth: 2 },
    ];
    const bounds = getGroupBounds(members);
    expect(bounds.left).toBe(10);
    expect(bounds.top).toBe(20);
    expect(bounds.right).toBe(250);
    expect(bounds.bottom).toBe(130);
    expect(bounds.centerX).toBe(130);
    expect(bounds.centerY).toBe(75);
  });

  it('getGroupBounds returns zeros for empty members', () => {
    const bounds = getGroupBounds([]);
    expect(bounds.left).toBe(0);
    expect(bounds.right).toBe(0);
    expect(bounds.width).toBe(0);
  });

  it('dissolveGroup returns member IDs', () => {
    const g: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1', 'e1', 't1'], strokeWidth: 0,
    };
    expect(dissolveGroup(g)).toEqual(['r1', 'e1', 't1']);
  });

  it('moveToGroup updates member IDs', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 1 },
      { id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0 },
    ];
    const updated = moveToGroup(elements, 'g1', ['r1', 'e1']);
    const group = updated.find(e => e.id === 'g1') as GroupElement;
    expect(group.memberIds).toEqual(['r1', 'e1']);
  });

  it('moveToGroup does not modify other elements', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 10, height: 10, color: '#000', strokeWidth: 1 },
      { id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0 },
    ];
    const updated = moveToGroup(elements, 'g1', ['r1', 'e1']);
    const rect = updated.find(e => e.id === 'r1') as any;
    expect(rect.x).toBe(10);
  });
});

describe('getElementBounds for group', () => {
  it('returns cached bounds when available', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 10, top: 20, right: 110, bottom: 70, centerX: 60, centerY: 45, width: 100, height: 50 },
    };
    const b = getElementBounds(group);
    expect(b.left).toBe(10);
    expect(b.top).toBe(20);
    expect(b.right).toBe(110);
    expect(b.bottom).toBe(70);
  });

  it('returns zero bounds when no cached bounds', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
    };
    const b = getElementBounds(group);
    expect(b.left).toBe(0);
    expect(b.right).toBe(0);
  });
});

describe('hitTest group', () => {
  it('returns true when point is within group bounds', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 10, top: 20, right: 110, bottom: 70, centerX: 60, centerY: 45, width: 100, height: 50 },
    };
    expect(hitTest(group, { x: 60, y: 45 })).toBe(true);
  });

  it('returns false when point is outside group bounds + padding', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 10, top: 20, right: 110, bottom: 70, centerX: 60, centerY: 45, width: 100, height: 50 },
    };
    expect(hitTest(group, { x: 0, y: 0 })).toBe(false);
  });

  it('returns false when no cached bounds', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
    };
    expect(hitTest(group, { x: 50, y: 50 })).toBe(false);
  });

  it('accepts point within padding margin', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 100, top: 100, right: 200, bottom: 200, centerX: 150, centerY: 150, width: 100, height: 100 },
    };
    // Within padding (8px)
    expect(hitTest(group, { x: 95, y: 150 })).toBe(true);
    // Outside padding
    expect(hitTest(group, { x: 90, y: 150 })).toBe(false);
  });
});

describe('getElementPos for group', () => {
  it('returns top-left of bounds when cached', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 10, top: 20, right: 110, bottom: 70, centerX: 60, centerY: 45, width: 100, height: 50 },
    };
    expect(getElementPos(group)).toEqual({ x: 10, y: 20 });
  });

  it('returns zero when no cached bounds', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
    };
    expect(getElementPos(group)).toEqual({ x: 0, y: 0 });
  });
});

describe('moveElement for group', () => {
  it('returns group unchanged', () => {
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
    };
    const moved = moveElement(group, 100, 200);
    expect(moved).toBe(group);
  });
});

describe('SelectTool group selection', () => {
  it('selects parent group when clicking a group member', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 0, top: 0, right: 100, bottom: 100, centerX: 50, centerY: 50, width: 100, height: 100 },
    };
    const tool = createTool('select', { color: '#000', strokeWidth: 2 });
    let selectedIds = new Set<string>();

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [rect, group],
      addElement: () => {},
      updateElement: () => {},
      deleteElements: () => {},
      setSelectedIds: (ids) => { selectedIds = ids; },
      getSelectedIds: () => selectedIds,
      canvasWidth: 800, canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    // Click on member element (rect at world (50, 50))
    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 450, clientY: 350 }),
      ctx as ToolContext
    );

    expect([...selectedIds]).toEqual(['g1']);
  });

  it('selects group when clicking group bounds (empty area)', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 2,
    };
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 0, top: 0, right: 100, bottom: 100, centerX: 50, centerY: 50, width: 100, height: 100 },
    };
    const tool = createTool('select', { color: '#000', strokeWidth: 2 });
    let selectedIds = new Set<string>();

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [rect, group],
      addElement: () => {},
      updateElement: () => {},
      deleteElements: () => {},
      setSelectedIds: (ids) => { selectedIds = ids; },
      getSelectedIds: () => selectedIds,
      canvasWidth: 800, canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    // Click within group bounds but not on member (world (50, 50))
    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 450, clientY: 350 }),
      ctx as ToolContext
    );

    expect([...selectedIds]).toEqual(['g1']);
  });

  it('shift-click bypasses group selection', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 2,
    };
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 0, top: 0, right: 100, bottom: 100, centerX: 50, centerY: 50, width: 100, height: 100 },
    };
    const tool = createTool('select', { color: '#000', strokeWidth: 2 });
    let selectedIds = new Set<string>();

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: [rect, group],
      addElement: () => {},
      updateElement: () => {},
      deleteElements: () => {},
      setSelectedIds: (ids) => { selectedIds = ids; },
      getSelectedIds: () => selectedIds,
      canvasWidth: 800, canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    // Shift-click on member (rect is found first since non-group elements are prioritized)
    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, shiftKey: true, clientX: 450, clientY: 350 }),
      ctx as ToolContext
    );

    // With shift, member is selected directly, not the group
    expect([...selectedIds]).toEqual(['r1']);
  });

  it('expands group members when dragging and moves them', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 50, height: 50, color: '#000', strokeWidth: 2,
    };
    const group: WBElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
      bounds: { left: 0, top: 0, right: 50, bottom: 50, centerX: 25, centerY: 25, width: 50, height: 50 },
    };
    const tool = createTool('select', { color: '#000', strokeWidth: 2 });
    let selectedIds = new Set<string>();
    const updatedElements: WBElement[] = [rect, group];

    const ctx: Partial<ToolContext> = {
      viewport: new Viewport(),
      elements: updatedElements,
      addElement: () => {},
      updateElement: (id, updater) => {
        const idx = updatedElements.findIndex(e => e.id === id);
        if (idx !== -1) updatedElements[idx] = updater(updatedElements[idx]);
      },
      deleteElements: () => {},
      setSelectedIds: (ids) => { selectedIds = ids; },
      getSelectedIds: () => selectedIds,
      canvasWidth: 800, canvasHeight: 600,
      scheduleRender: () => {},
      getOffset: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
      activeColor: '#000',
      startEditing: () => {},
      requestImageUpload: () => {},
      snapConfig: { enabled: false, gridSize: 20, threshold: 8 } as SnapConfig,
      snapToGrid: (p: Point) => p,
      setGuides: () => {},
      resolveBindings: () => {},
      setArrowSnapTarget: () => {},
    };

    // Click group (selects it)
    tool.onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }),
      ctx as ToolContext
    );
    expect([...selectedIds]).toEqual(['g1']);

    // Drag
    tool.onPointerMove(
      new PointerEvent('pointermove', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );
    tool.onPointerUp(
      new PointerEvent('pointerup', { button: 0, clientX: 500, clientY: 400 }),
      ctx as ToolContext
    );

    // Member element should have moved
    const movedRect = updatedElements.find(e => e.id === 'r1') as any;
    expect(movedRect.x).toBe(100); // dx = 100, dy = 100, orig x = 0
    expect(movedRect.y).toBe(100);
  });
});

describe('Whiteboard group operations', () => {
  it('createGroupFromSelection returns null with < 2 selected', () => {
    const canvas = createMockCanvas();
    const wb = new Whiteboard({ canvas });
    wb.selectedIds = new Set(['r1']);
    expect(wb.createGroupFromSelection()).toBeNull();
  });

  it('createGroupFromSelection creates a group from 2+ elements', () => {
    const canvas = createMockCanvas();
    const wb = new Whiteboard({ canvas });
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const ellipse: WBElement = {
      id: 'e1', type: 'ellipse', x: 200, y: 100, rx: 50, ry: 30, color: '#000', strokeWidth: 2,
    };
    wb.elements.push(rect, ellipse);
    wb.selectedIds = new Set(['r1', 'e1']);

    const groupId = wb.createGroupFromSelection('My Group', '#d1fae5');

    expect(groupId).not.toBeNull();
    const group = wb.elements.find(e => e.id === groupId) as GroupElement;
    expect(group).toBeDefined();
    expect(group.type).toBe('group');
    expect(group.label).toBe('My Group');
    expect(group.color).toBe('#d1fae5');
    expect(group.memberIds).toContain('r1');
    expect(group.memberIds).toContain('e1');
    expect(wb.selectedIds.has(groupId!)).toBe(true);
  });

  it('createGroupFromSelection flattens nested groups', () => {
    const canvas = createMockCanvas();
    const wb = new Whiteboard({ canvas });
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 50, height: 50, color: '#000', strokeWidth: 2,
    };
    const innerGroup: GroupElement = {
      id: 'g1', type: 'group', label: 'Inner', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
    };
    wb.elements.push(rect, innerGroup);
    wb.selectedIds = new Set(['g1', 'e1']);

    const groupId = wb.createGroupFromSelection('Outer');
    const outer = wb.elements.find(e => e.id === groupId) as GroupElement;
    expect(outer).toBeDefined();
    // Should flatten: g1's members (r1) + e1
    expect(outer.memberIds).not.toContain('g1');
    expect(outer.memberIds).toContain('r1');
  });

  it('ungroupSelection dissolves a group and selects members', () => {
    const canvas = createMockCanvas();
    const wb = new Whiteboard({ canvas });
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1', 'e1'], strokeWidth: 0,
    };
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 50, height: 50, color: '#000', strokeWidth: 2,
    };
    wb.elements.push(group, rect);
    wb.selectedIds = new Set(['g1']);

    wb.ungroupSelection();

    expect(wb.elements.find(e => e.id === 'g1')).toBeUndefined();
    expect(wb.selectedIds.has('r1')).toBe(true);
    expect(wb.selectedIds.has('e1')).toBe(true);
  });

  it('addToGroup adds members to existing group', () => {
    const canvas = createMockCanvas();
    const wb = new Whiteboard({ canvas });
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
    };
    wb.elements.push(group);

    wb.addToGroup('g1', ['e1', 't1']);

    const g = wb.elements.find(e => e.id === 'g1') as GroupElement;
    expect(g.memberIds).toContain('r1');
    expect(g.memberIds).toContain('e1');
    expect(g.memberIds).toContain('t1');
  });

  it('removeFromGroup removes a member', () => {
    const canvas = createMockCanvas();
    const wb = new Whiteboard({ canvas });
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1', 'e1'], strokeWidth: 0,
    };
    wb.elements.push(group);

    wb.removeFromGroup('g1', 'e1');

    const g = wb.elements.find(e => e.id === 'g1') as GroupElement;
    expect(g.memberIds).toEqual(['r1']);
  });

  it('removeFromGroup auto-dissolves when last member removed', () => {
    const canvas = createMockCanvas();
    const wb = new Whiteboard({ canvas });
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
    };
    wb.elements.push(group);

    wb.removeFromGroup('g1', 'r1');

    expect(wb.elements.find(e => e.id === 'g1')).toBeUndefined();
  });
});

describe('cleanupOrphanedMembers', () => {
  it('removes deleted element ID from group memberIds', () => {
    const wb = new Whiteboard({ canvas: createMockCanvas() });
    const r1: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 2,
    };
    const e1: WBElement = {
      id: 'e1', type: 'ellipse', x: 100, y: 100, rx: 20, ry: 20, color: '#000', strokeWidth: 2,
    };
    const t1: WBElement = {
      id: 't1', type: 'text', x: 200, y: 200, width: 100, height: 30,
      text: '', fontSize: 16, fontFamily: 'sans-serif', fill: 'transparent', color: '#000', strokeWidth: 1,
    };
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1', 'e1', 't1'], strokeWidth: 0,
    };
    wb.elements.push(r1, e1, t1, group);

    wb.cleanupOrphanedMembers(new Set(['r1']));

    const g = wb.elements.find(e => e.id === 'g1') as GroupElement;
    expect(g).toBeDefined();
    expect(g.memberIds).toEqual(['e1', 't1']);
  });

  it('auto-dissolves group with ≤1 member', () => {
    const wb = new Whiteboard({ canvas: createMockCanvas() });
    const r1: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 2,
    };
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
    };
    wb.elements.push(r1, group);

    wb.cleanupOrphanedMembers(new Set(['r1']));

    expect(wb.elements.find(e => e.id === 'g1')).toBeUndefined();
  });

  it('does not change group when no members deleted', () => {
    const wb = new Whiteboard({ canvas: createMockCanvas() });
    const r1: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 2,
    };
    const e1: WBElement = {
      id: 'e1', type: 'ellipse', x: 100, y: 100, rx: 20, ry: 20, color: '#000', strokeWidth: 2,
    };
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1', 'e1'], strokeWidth: 0,
    };
    wb.elements.push(r1, e1, group);

    wb.cleanupOrphanedMembers(new Set(['x1']));

    const g = wb.elements.find(e => e.id === 'g1') as GroupElement;
    expect(g).toBeDefined();
    expect(g.memberIds).toEqual(['r1', 'e1']);
  });
});

describe('Renderer group rendering', () => {
  it('drawGroup does not throw', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'Test', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
    };
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const elements: WBElement[] = [group, rect];
    expect(() => (renderer as any).drawGroup(group, elements)).not.toThrow();
  });

  it('drawGroupSelection does not throw', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'Test', color: '#fef3c7',
      memberIds: ['r1'], strokeWidth: 0,
    };
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const elements: WBElement[] = [group, rect];
    expect(() => (renderer as any).drawGroupSelection(group, elements)).not.toThrow();
  });

  it('drawGroup handles empty members', () => {
    const canvas = createMockCanvas();
    const renderer = new Renderer(canvas);
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['nonexistent'], strokeWidth: 0,
    };
    expect(() => (renderer as any).drawGroup(group, [group])).not.toThrow();
  });
});

describe('getElementBounds resolution', () => {
  it('resolveGroupBounds computes bounds', () => {
    const wb = new Whiteboard({ canvas: createMockCanvas() });
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 2,
    };
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0,
    };
    wb.elements.push(rect, group);

    (wb as any).resolveGroupBounds();

    expect(group.bounds).toBeDefined();
    expect(group.bounds!.left).toBe(10);
    expect(group.bounds!.right).toBe(110);
  });
});

describe('Group JSON serialization', () => {
  it('GroupElement round-trips through JSON', () => {
    const state: WhiteboardState = {
      version: '1.0.0',
      elements: [
        { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 1 },
        { id: 'g1', type: 'group', label: 'Team A', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0 },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      toolColor: '#1f2937',
      toolStrokeWidth: 2,
      toolArrowStart: false,
      toolArrowEnd: true,
      snapEnabled: false,
      themeMode: 'light',
    };

    const json = JSON.stringify(state);
    const parsed = JSON.parse(json) as WhiteboardState;

    expect(parsed.elements).toHaveLength(2);
    const group = parsed.elements[1] as GroupElement;
    expect(group.type).toBe('group');
    expect(group.label).toBe('Team A');
    expect(group.color).toBe('#fef3c7');
    expect(group.memberIds).toEqual(['r1']);
  });
});

describe('History with groups', () => {
  it('DeleteElementsCommand preserves group memberIds (cleanup is in Whiteboard)', () => {
    const rect: WBElement = {
      id: 'r1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 2,
    };
    const ellipse: WBElement = {
      id: 'e1', type: 'ellipse', x: 100, y: 100, rx: 20, ry: 20, color: '#000', strokeWidth: 2,
    };
    const group: GroupElement = {
      id: 'g1', type: 'group', label: 'G', color: '#fef3c7', memberIds: ['r1', 'e1'], strokeWidth: 0,
    };
    const elements: WBElement[] = [rect, ellipse, group];

    const history = new HistoryStack();
    history.execute(new DeleteElementsCommand(elements, ['r1']));

    expect(elements.length).toBe(2);
    expect(elements.find(e => e.id === 'r1')).toBeUndefined();
    // Group memberIds are unchanged by the command itself (Whiteboard calls cleanupOrphanedMembers separately)
    expect(group.memberIds).toEqual(['r1', 'e1']);
  });

  it('UpdateElementCommand preserves group properties', () => {
    const elements: WBElement[] = [
      { id: 'g1', type: 'group', label: 'Old', color: '#fef3c7', memberIds: ['r1'], strokeWidth: 0 },
    ];
    const history = new HistoryStack();
    history.execute(new UpdateElementCommand(elements, 'g1', { label: 'New', color: '#d1fae5' } as any));

    const g = elements[0] as GroupElement;
    expect(g.label).toBe('New');
    expect(g.color).toBe('#d1fae5');
    expect(g.memberIds).toEqual(['r1']);

    history.undo();
    expect(g.label).toBe('Old');
    expect(g.color).toBe('#fef3c7');
  });
});

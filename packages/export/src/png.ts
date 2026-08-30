import { Renderer, Viewport } from '@whiteboard/core';
import type { WBElement } from '@whiteboard/core';
import type { ExportOptions } from './types';
import { computeBounds } from './bounds';

export async function exportToPng(
  elements: WBElement[],
  options: Partial<ExportOptions> = {},
): Promise<Blob> {
  const opts: ExportOptions = {
    background: options.background ?? '#ffffff',
    padding: options.padding ?? 40,
    scale: options.scale ?? 2,
    viewport: options.viewport,
  };

  const bounds = computeBounds(elements);
  if (!bounds) {
    const canvas = document.createElement('canvas');
    canvas.width = 100 * opts.scale;
    canvas.height = 100 * opts.scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas);
  }

  const contentWidth = (bounds.maxX - bounds.minX) + opts.padding * 2;
  const contentHeight = (bounds.maxY - bounds.minY) + opts.padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = contentWidth * opts.scale;
  canvas.height = contentHeight * opts.scale;
  canvas.style.width = `${contentWidth}px`;
  canvas.style.height = `${contentHeight}px`;

  const ctx = canvas.getContext('2d')!;

  ctx.setTransform(opts.scale, 0, 0, opts.scale, 0, 0);
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, contentWidth, contentHeight);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const viewport = new Viewport(opts.viewport ?? {
    x: 0,
    y: 0,
    zoom: 1,
  });

  if (!opts.viewport) {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    viewport.x = -(centerX - contentWidth / 2);
    viewport.y = -(centerY - contentHeight / 2);
    viewport.zoom = 1;
  }

  const renderer = new Renderer(canvas);
  renderer.render(viewport, elements, new Set(), undefined, null, undefined, opts.theme);

  return canvasToBlob(canvas);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create PNG blob'));
    }, 'image/png');
  });
}
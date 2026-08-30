import type { WBElement, GroupElement } from '@whiteboard/core';
import type { ExportOptions } from './types';
import { computeBounds } from './bounds';
import { layoutText } from '@whiteboard/core';

export function exportToSvg(
  elements: WBElement[],
  options: Partial<ExportOptions> = {},
): string {
  const opts: ExportOptions = {
    background: options.background ?? '#ffffff',
    padding: options.padding ?? 40,
    scale: 1,
    viewport: options.viewport,
  };

  const bounds = computeBounds(elements);

  const minX = bounds?.minX ?? 0;
  const minY = bounds?.minY ?? 0;
  const maxX = bounds?.maxX ?? 100;
  const maxY = bounds?.maxY ?? 100;

  const width = (maxX - minX) + opts.padding * 2;
  const height = (maxY - minY) + opts.padding * 2;

  const offsetX = -minX + opts.padding;
  const offsetY = -minY + opts.padding;

  const lines: string[] = [];

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  lines.push(`  <rect width="${width}" height="${height}" fill="${opts.background}" />`);
  lines.push(`  <g transform="translate(${offsetX}, ${offsetY})">`);

  // First pass: group backgrounds
  for (const el of elements) {
    if (el.type === 'group') {
      const g = el as GroupElement;
      const b = g.bounds;
      if (b) {
        const pad = 8;
        lines.push(`    <rect x="${b.left - pad}" y="${b.top - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" fill="${g.color}" fill-opacity="0.25" stroke="${g.color}" stroke-width="2" stroke-dasharray="8,4" />`);
        if (g.label) {
          lines.push(`    <text x="${b.left - pad}" y="${b.top - pad - 4}" fill="${g.color}" font-size="12">${escapeXml(g.label)}</text>`);
        }
      }
    }
  }

  // Second pass: non-group elements
  for (const el of elements) {
    if (el.type === 'group') continue;
    lines.push('    ' + elementToSvg(el));
  }

  lines.push('  </g>');
  lines.push('</svg>');

  return lines.join('\n');
}

function elementToSvg(el: WBElement): string {
  const content = elementToSvgUnrotated(el);
  if (!content || !el.rotation || el.type === 'path' || el.type === 'arrow' || el.type === 'group') return content;
  const center = el.type === 'ellipse' ? { x: el.x, y: el.y } : { x: el.x + el.width / 2, y: el.y + el.height / 2 };
  return `<g transform="rotate(${el.rotation * 180 / Math.PI} ${center.x} ${center.y})">${content}</g>`;
}

function elementToSvgUnrotated(el: WBElement): string {
  switch (el.type) {
    case 'path':
      return pathToSvg(el);
    case 'rectangle':
      return rectToSvg(el);
    case 'ellipse':
      return ellipseToSvg(el);
    case 'text':
      return textToSvg(el);
    case 'sticky':
      return stickyToSvg(el);
    case 'image':
      return imageToSvg(el);
    case 'arrow':
      return arrowToSvg(el);
    case 'group':
      return '';
  }
}

function pathToSvg(el: Extract<WBElement, { type: 'path' }>): string {
  const d = el.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  return `<path d="${d}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
}

function rectToSvg(el: Extract<WBElement, { type: 'rectangle' }>): string {
  return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none" />`;
}

function ellipseToSvg(el: Extract<WBElement, { type: 'ellipse' }>): string {
  return `<ellipse cx="${el.x}" cy="${el.y}" rx="${el.rx}" ry="${el.ry}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none" />`;
}

function textToSvg(el: Extract<WBElement, { type: 'text' }>): string {
  return richTextSvg(el);
}

function stickyToSvg(el: Extract<WBElement, { type: 'sticky' }>): string {
  return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${escapeXml(el.fill)}" />\n    ${richTextSvg(el)}`;
}

function richTextSvg(el: Extract<WBElement, { type: 'text' | 'sticky' }>): string {
  const weight = el.fontWeight ?? 'normal';
  const style = el.fontStyle ?? 'normal';
  const approximateMeasure = (text: string) => text.length * el.fontSize * 0.45;
  const lines = layoutText({ text: el.text, width: el.width, fontSize: el.fontSize, textAlign: el.textAlign, padding: el.type === 'sticky' ? 8 : 4, measureText: approximateMeasure });
  const tspans = lines.map(line => `<tspan x="${el.x + line.x}" y="${el.y + line.y + el.fontSize}">${escapeXml(line.text)}</tspan>`).join('');
  return `<text font-size="${el.fontSize}" font-family="${escapeXml(el.fontFamily)}" font-weight="${weight}" font-style="${style}" fill="${escapeXml(el.color)}">${tspans}</text>`;
}

function imageToSvg(el: Extract<WBElement, { type: 'image' }>): string {
  return `<image x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" href="${el.src}" />`;
}

function arrowToSvg(el: Extract<WBElement, { type: 'arrow' }>): string {
  const parts: string[] = [];
  parts.push(`<line x1="${el.startX}" y1="${el.startY}" x2="${el.endX}" y2="${el.endY}" stroke="${el.color}" stroke-width="${el.strokeWidth}" stroke-linecap="round" />`);

  if (el.endArrowhead) {
    parts.push(arrowheadSvg(el.startX, el.startY, el.endX, el.endY, el.color));
  }
  if (el.startArrowhead) {
    parts.push(arrowheadSvg(el.endX, el.endY, el.startX, el.startY, el.color));
  }
  return parts.join('\n    ');
}

function arrowheadSvg(fromX: number, fromY: number, toX: number, toY: number, color: string): string {
  const headLength = 10;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const p1x = toX - headLength * Math.cos(angle - Math.PI / 6);
  const p1y = toY - headLength * Math.sin(angle - Math.PI / 6);
  const p2x = toX - headLength * Math.cos(angle + Math.PI / 6);
  const p2y = toY - headLength * Math.sin(angle + Math.PI / 6);
  return `<polygon points="${toX},${toY} ${p1x},${p1y} ${p2x},${p2y}" fill="${color}" />`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

import type { FontStyle, FontWeight, TextAlign } from './types';

export const TEXT_PADDING = 4;
export const TEXT_LINE_HEIGHT = 1.3;

export interface TextLayoutOptions {
  text: string;
  width: number;
  fontSize: number;
  textAlign?: TextAlign;
  padding?: number;
  measureText: (text: string) => number;
}

export interface TextLayoutLine {
  text: string;
  x: number;
  y: number;
}

export function textFont(fontSize: number, fontFamily: string, fontWeight: FontWeight = 'normal', fontStyle: FontStyle = 'normal'): string {
  return `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
}

export function layoutText(options: TextLayoutOptions): TextLayoutLine[] {
  const padding = options.padding ?? TEXT_PADDING;
  const maxWidth = Math.max(1, options.width - padding * 2);
  const align = options.textAlign ?? 'left';
  const wrapped: string[] = [];

  for (const paragraph of options.text.split('\n')) {
    if (paragraph === '') {
      wrapped.push('');
      continue;
    }
    let line = '';
    for (const token of paragraph.match(/\S+\s*/gu) ?? [paragraph]) {
      const candidate = line + token;
      if (line && options.measureText(candidate.trimEnd()) > maxWidth) {
        wrapped.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    }
    wrapped.push(line.trimEnd());
  }

  return wrapped.map((text, index) => {
    const measured = options.measureText(text);
    const x = align === 'center'
      ? padding + (maxWidth - measured) / 2
      : align === 'right' ? options.width - padding - measured : padding;
    return { text, x, y: padding + index * options.fontSize * TEXT_LINE_HEIGHT };
  });
}

export function requiredTextHeight(lineCount: number, fontSize: number, padding = TEXT_PADDING): number {
  return padding * 2 + Math.max(1, lineCount) * fontSize * TEXT_LINE_HEIGHT;
}

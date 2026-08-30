import type { WBElement, ViewportState } from '@whiteboard/core';
import type { JsonExport } from './types';

export function exportToJson(
  elements: WBElement[],
  viewport: ViewportState,
): JsonExport {
  return {
    version: '0.0.1',
    elements: structuredClone(elements),
    viewport: { ...viewport },
    exportedAt: new Date().toISOString(),
  };
}

export function importFromJson(json: string): JsonExport {
  const data = JSON.parse(json);
  if (!data.version || !Array.isArray(data.elements)) {
    throw new Error('Invalid whiteboard JSON: missing version or elements');
  }
  return data as JsonExport;
}
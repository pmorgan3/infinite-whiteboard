import type { WBElement, ViewportState, ThemeConfig } from '@whiteboard/core';

export interface ExportOptions {
  background: string;
  padding: number;
  scale: number;
  viewport?: ViewportState;
  theme?: ThemeConfig;
}

export interface JsonExport {
  version: string;
  elements: WBElement[];
  viewport: ViewportState;
  exportedAt: string;
}
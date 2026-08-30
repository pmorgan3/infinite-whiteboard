import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'WhiteboardExport',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@whiteboard/core'],
    },
  },
});
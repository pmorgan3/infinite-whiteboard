import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type * as YType from 'yjs';
import type { Persistence } from 'y-websocket/bin/utils';

// y-websocket is CJS and uses `require('yjs')`. To share the same Yjs module
// instance (and avoid the "Yjs was already imported" warning + broken
// instanceof checks across the CJS/ESM split), load yjs via CJS require here.
const Y = createRequire(import.meta.url)('yjs') as typeof YType;

const SAFE_DOC_NAME = /^[A-Za-z0-9._-]+$/;

export function createFsPersistence(dir: string): Persistence {
  if (!existsSync(dir)) {
    void mkdir(dir, { recursive: true });
  }

  const pathFor = (docName: string): string | null => {
    if (!SAFE_DOC_NAME.test(docName)) return null;
    return join(dir, `${docName}.ydoc`);
  };

  return {
    async bindState(docName, doc) {
      const path = pathFor(docName);
      if (!path) return;
      try {
        const buf = await readFile(path);
        Y.applyUpdate(doc, buf);
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.error(`[persistence] failed to load ${docName}:`, err);
        }
      }
    },

    async writeState(docName, doc) {
      const path = pathFor(docName);
      if (!path) return;
      const update = Y.encodeStateAsUpdate(doc);
      const tmp = `${path}.tmp`;
      try {
        await writeFile(tmp, update);
        await rename(tmp, path);
      } catch (err) {
        console.error(`[persistence] failed to write ${docName}:`, err);
      }
    },
  };
}

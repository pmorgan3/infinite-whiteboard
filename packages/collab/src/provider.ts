import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { WBElement } from '@whiteboard/core';

export interface CollabProviderOptions {
  roomId: string;
  websocketUrl: string;
  userName: string;
  userColor: string;
  onElementsChange?: (elements: WBElement[]) => void;
  onCursorsChange?: (cursors: Map<number, CursorInfo>) => void;
}

export interface CursorInfo {
  x: number;
  y: number;
  name: string;
  color: string;
}

function elementToYMap(el: WBElement): Y.Map<any> {
  const map = new Y.Map<any>();
  for (const [key, value] of Object.entries(el)) {
    map.set(key, value);
  }
  return map;
}

export class CollabProvider {
  doc: Y.Doc;
  provider: WebsocketProvider;
  elementsArray: Y.Array<Y.Map<any>>;
  private onElementsChange?: (elements: WBElement[]) => void;
  private onCursorsChange?: (cursors: Map<number, CursorInfo>) => void;
  private unsubscribes: (() => void)[] = [];

  constructor(options: CollabProviderOptions) {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(
      options.websocketUrl,
      options.roomId,
      this.doc
    );
    this.elementsArray = this.doc.getArray<Y.Map<any>>('elements');
    this.onElementsChange = options.onElementsChange;
    this.onCursorsChange = options.onCursorsChange;

    // Set awareness
    this.provider.awareness.setLocalStateField('user', {
      name: options.userName,
      color: options.userColor,
    });

    // Listen for element changes
    const observer = () => {
      this.onElementsChange?.(this.getElements());
    };
    this.elementsArray.observe(observer);
    this.unsubscribes.push(() => this.elementsArray.unobserve(observer));

    // Listen for awareness/cursors
    this.provider.awareness.on('change', () => {
      this.emitCursors();
    });

    this.emitCursors();
  }

  getElements(): WBElement[] {
    const result: WBElement[] = [];
    for (const map of this.elementsArray) {
      const obj = map.toJSON();
      if (obj && typeof obj.type === 'string' && typeof obj.id === 'string') {
        result.push(obj as WBElement);
      }
    }
    return result;
  }

  setElements(elements: WBElement[]) {
    this.doc.transact(() => {
      this.elementsArray.delete(0, this.elementsArray.length);
      for (const el of elements) {
        this.elementsArray.push([elementToYMap(el)]);
      }
    });
  }

  addElement(element: WBElement) {
    this.doc.transact(() => {
      this.elementsArray.push([elementToYMap(element)]);
    });
  }

  removeElement(id: string) {
    this.doc.transact(() => {
      for (let i = 0; i < this.elementsArray.length; i++) {
        const map = this.elementsArray.get(i);
        if (map.get('id') === id) {
          this.elementsArray.delete(i, 1);
          break;
        }
      }
    });
  }

  updateCursor(x: number, y: number) {
    this.provider.awareness.setLocalStateField('cursor', { x, y });
  }

  private emitCursors() {
    const cursors = new Map<number, CursorInfo>();
    const states = this.provider.awareness.getStates();
    const localClientId = this.provider.awareness.clientID;
    states.forEach((state, clientId) => {
      if (clientId === localClientId) return;
      const cursor = state.cursor;
      const user = state.user;
      if (cursor && user) {
        cursors.set(clientId, {
          x: cursor.x,
          y: cursor.y,
          name: user.name,
          color: user.color,
        });
      }
    });
    this.onCursorsChange?.(cursors);
  }

  destroy() {
    for (const unsub of this.unsubscribes) unsub();
    this.provider.awareness.destroy();
    this.provider.destroy();
    this.doc.destroy();
  }
}

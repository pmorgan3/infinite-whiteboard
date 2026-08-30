import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { WBElement } from '@whiteboard/core';

export type CollabStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export interface ParticipantInfo { clientId: number; name: string; color: string; isLocal: boolean; }
export interface CursorInfo { x: number; y: number; name: string; color: string; }
export interface CollabProviderOptions {
  roomId: string; websocketUrl: string; userName: string; userColor: string;
  onElementsChange?: (elements: WBElement[]) => void;
  onCursorsChange?: (cursors: Map<number, CursorInfo>) => void;
  onParticipantsChange?: (participants: ParticipantInfo[]) => void;
  onStatusChange?: (status: CollabStatus) => void;
  onSync?: (isSynced: boolean) => void;
  onError?: (error: Error | null) => void;
}

export const LOCAL_ORIGIN = Symbol('whiteboard-local');
const cloneValue = <T,>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;

function elementToYMap(element: WBElement): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(element)) map.set(key, cloneValue(value));
  return map;
}

function updateYMap(map: Y.Map<unknown>, element: WBElement): void {
  const next = element as unknown as Record<string, unknown>;
  for (const key of Array.from(map.keys())) if (!(key in next)) map.delete(key);
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(map.get(key)) !== JSON.stringify(value)) map.set(key, cloneValue(value));
  }
}

export function readElements(array: Y.Array<Y.Map<unknown>>): WBElement[] {
  const result: WBElement[] = [];
  const seen = new Set<string>();
  for (const map of array) {
    const value = cloneValue(map.toJSON()) as Partial<WBElement>;
    if (typeof value.id === 'string' && typeof value.type === 'string' && !seen.has(value.id)) {
      seen.add(value.id);
      result.push(value as WBElement);
    }
  }
  return result;
}

/** Reconcile by identity while retaining shared maps for unrelated concurrent edits. */
export function reconcileElements(doc: Y.Doc, array: Y.Array<Y.Map<unknown>>, elements: WBElement[], origin: unknown = LOCAL_ORIGIN, removableIds?: ReadonlySet<string>): void {
  doc.transact(() => {
    const desiredIds = new Set(elements.map((element) => element.id));
    const existing = new Map<string, Y.Map<unknown>>();
    for (let index = array.length - 1; index >= 0; index--) {
      const map = array.get(index);
      const id = map.get('id');
      if (typeof id !== 'string' || existing.has(id)) array.delete(index, 1);
      else if (!desiredIds.has(id) && (!removableIds || removableIds.has(id))) array.delete(index, 1);
      else existing.set(id, map);
    }
    elements.forEach((element, targetIndex) => {
      let map = existing.get(element.id);
      if (!map) {
        map = elementToYMap(element);
        array.insert(Math.min(targetIndex, array.length), [map]);
      } else {
        updateYMap(map, element);
        const currentIndex = array.toArray().indexOf(map);
        if (currentIndex !== targetIndex) {
          array.delete(currentIndex, 1);
          array.insert(Math.min(targetIndex, array.length), [map]);
        }
      }
    });
  }, origin);
}

export class CollabProvider {
  readonly doc = new Y.Doc();
  readonly provider: WebsocketProvider;
  readonly elementsArray: Y.Array<Y.Map<unknown>>;
  private initialized = false;
  private hasConnected = false;
  private destroyed = false;
  private pendingElements: WBElement[] | null = null;
  private knownIds = new Set<string>();

  constructor(private readonly options: CollabProviderOptions) {
    this.elementsArray = this.doc.getArray<Y.Map<unknown>>('elements');
    this.provider = new WebsocketProvider(options.websocketUrl, options.roomId, this.doc);
    this.provider.awareness.setLocalStateField('user', { name: options.userName, color: options.userColor });
    this.elementsArray.observeDeep(this.handleElements);
    this.provider.awareness.on('change', this.handleAwareness);
    this.provider.on('status', this.handleStatus);
    this.provider.on('sync', this.handleSync);
    this.provider.on('connection-error', this.handleConnectionError);
    this.provider.on('connection-close', this.handleConnectionClose);
    options.onStatusChange?.('connecting');
    this.emitPresence();
  }

  private handleElements = (_events: Y.YEvent<any>[], transaction: Y.Transaction) => {
    if (this.initialized && transaction.origin !== LOCAL_ORIGIN) {
      const elements = this.getElements();
      this.knownIds = new Set(elements.map((element) => element.id));
      this.options.onElementsChange?.(elements);
    }
  };
  private handleStatus = ({ status }: { status: 'connected' | 'connecting' | 'disconnected' }) => {
    if (status === 'connected') {
      this.hasConnected = true;
      this.options.onError?.(null);
      this.options.onStatusChange?.('connected');
    } else if (status === 'connecting') this.options.onStatusChange?.(this.hasConnected ? 'reconnecting' : 'connecting');
    else this.options.onStatusChange?.('disconnected');
  };
  private handleSync = (isSynced: boolean) => {
    this.options.onSync?.(isSynced);
    if (!isSynced) return;
    const roomElements = this.getElements();
    this.knownIds = new Set(roomElements.map((element) => element.id));
    if (roomElements.length) this.options.onElementsChange?.(roomElements);
    else if (this.pendingElements?.length) reconcileElements(this.doc, this.elementsArray, this.pendingElements);
    this.pendingElements = null;
    this.initialized = true;
  };
  private handleConnectionError = (event: Event) => this.options.onError?.(new Error(`Collaboration connection failed (${event.type}).`));
  private handleConnectionClose = (event: CloseEvent | null) => {
    if (!this.destroyed && event && event.code !== 1000) this.options.onError?.(new Error(`Connection closed (${event.code}). Retrying…`));
  };
  private handleAwareness = () => this.emitPresence();

  getElements(): WBElement[] { return readElements(this.elementsArray); }
  setElements(elements: WBElement[]): void {
    if (!this.initialized) { this.pendingElements = cloneValue(elements); return; }
    reconcileElements(this.doc, this.elementsArray, elements, LOCAL_ORIGIN, this.knownIds);
    this.knownIds = new Set(this.getElements().map((element) => element.id));
  }
  updateUser(name: string, color: string): void { this.provider.awareness.setLocalStateField('user', { name, color }); }
  updateCursor(x: number, y: number): void { this.provider.awareness.setLocalStateField('cursor', { x, y }); }

  private emitPresence(): void {
    const cursors = new Map<number, CursorInfo>();
    const participants: ParticipantInfo[] = [];
    const localId = this.provider.awareness.clientID;
    this.provider.awareness.getStates().forEach((state, clientId) => {
      const user = state.user as { name?: unknown; color?: unknown } | undefined;
      if (!user || typeof user.name !== 'string' || typeof user.color !== 'string') return;
      participants.push({ clientId, name: user.name, color: user.color, isLocal: clientId === localId });
      const cursor = state.cursor as { x?: unknown; y?: unknown } | undefined;
      if (clientId !== localId && typeof cursor?.x === 'number' && typeof cursor.y === 'number') cursors.set(clientId, { x: cursor.x, y: cursor.y, name: user.name, color: user.color });
    });
    participants.sort((a, b) => a.clientId - b.clientId);
    this.options.onCursorsChange?.(cursors);
    this.options.onParticipantsChange?.(participants);
  }

  destroy(): void {
    this.destroyed = true;
    this.elementsArray.unobserveDeep(this.handleElements);
    this.provider.awareness.off('change', this.handleAwareness);
    this.provider.off('status', this.handleStatus);
    this.provider.off('sync', this.handleSync);
    this.provider.off('connection-error', this.handleConnectionError);
    this.provider.off('connection-close', this.handleConnectionClose);
    this.provider.awareness.setLocalState(null);
    this.provider.destroy();
    this.doc.destroy();
    this.options.onCursorsChange?.(new Map());
    this.options.onParticipantsChange?.([]);
    this.options.onStatusChange?.('disconnected');
  }
}

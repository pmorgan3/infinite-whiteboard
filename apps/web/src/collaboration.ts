export const ROOM_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function validateRoomId(roomId: string): string | null {
  if (!roomId) return 'Enter a room ID.';
  return ROOM_ID_PATTERN.test(roomId) ? null : 'Use only letters, numbers, dots, underscores, and hyphens.';
}

export function roomFromUrl(url: URL): { roomId: string | null; error: string | null } {
  const roomId = url.searchParams.get('room');
  if (roomId === null) return { roomId: null, error: null };
  return { roomId: validateRoomId(roomId) ? null : roomId, error: validateRoomId(roomId) };
}

export function urlForRoom(url: URL, roomId: string | null): URL {
  const result = new URL(url);
  if (roomId) result.searchParams.set('room', roomId);
  else result.searchParams.delete('room');
  return result;
}

export function collaborationWebsocketUrl(location: Location, configured = import.meta.env.VITE_COLLAB_WS_URL): string {
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'ws://localhost:1234';
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}

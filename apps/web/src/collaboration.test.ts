import { describe, expect, it } from 'vitest';
import { roomFromUrl, urlForRoom, validateRoomId } from './collaboration';

describe('collaboration URLs', () => {
  it('validates server-compatible room ids', () => {
    expect(validateRoomId('project-alpha_1.2')).toBeNull();
    expect(validateRoomId('../bad room')).not.toBeNull();
  });
  it('parses room membership without accepting invalid input', () => {
    expect(roomFromUrl(new URL('https://board.test/?room=team-1'))).toEqual({ roomId: 'team-1', error: null });
    expect(roomFromUrl(new URL('https://board.test/?room=bad%2Froom')).roomId).toBeNull();
  });
  it('generates join and leave URLs while preserving other query values', () => {
    const joined = urlForRoom(new URL('https://board.test/path?theme=dark#x'), 'team');
    expect(joined.href).toBe('https://board.test/path?theme=dark&room=team#x');
    expect(urlForRoom(joined, null).href).toBe('https://board.test/path?theme=dark#x');
  });
});

import { describe, expect, it } from 'vitest';
import { isRoomCode, makeRoomCode } from './code';
import { NICK_MAX, VOICE_MAX_BYTES } from './constants';
import { parseC2S, parseVoice } from './messages';
import { FUN_NAMES } from './names';
import { sanitizeNickname } from './nickname';

describe('room codes', () => {
  it('are 4 letters without I, O, 0, 1', () => {
    for (let i = 0; i < 500; i++) {
      const c = makeRoomCode();
      expect(c).toMatch(/^[A-Z]{4}$/);
      expect(c).not.toMatch(/[IO01]/);
      expect(isRoomCode(c)).toBe(true);
    }
    expect(isRoomCode('ABIO')).toBe(false);
    expect(isRoomCode('abcd')).toBe(false);
  });
});

describe('nicknames', () => {
  it('fun names are valid nicknames', () => {
    expect(FUN_NAMES.length).toBeGreaterThanOrEqual(40);
    for (const n of FUN_NAMES) expect(sanitizeNickname(n)).toBe(n);
  });

  it('trims, collapses spaces, caps length and strips control/markup chars', () => {
    expect(sanitizeNickname('  Kochu   Rajan  ')).toBe('Kochu Rajan');
    expect(sanitizeNickname('a'.repeat(40))).toHaveLength(NICK_MAX);
    expect(sanitizeNickname('<b>Hi</b>' + String.fromCharCode(0x200b, 0x2028))).toBe('bHi/b');
    expect(sanitizeNickname('   ')).toBeNull();
    expect(sanitizeNickname(42)).toBeNull();
  });

  it('rejects basic profanity including leetspeak', () => {
    expect(sanitizeNickname('fuck')).toBeNull();
    expect(sanitizeNickname('Sh1t head')).toBeNull();
    expect(sanitizeNickname('grape juice')).toBe('grape juice');
  });
});

describe('client messages', () => {
  const id = '6f1c2b1e-8a1d-4b7a-9c3e-2f5d6a7b8c9d';
  it('accepts valid payloads', () => {
    expect(parseC2S('shoot', { seq: 3, angle: 1.2, power: 0.7 })).toEqual({ seq: 3, angle: 1.2, power: 0.7 });
    expect(parseC2S('join', { code: 'ABCD', playerId: id, nickname: 'x' })).not.toBeNull();
    expect(parseC2S('react', { emoji: '🔥' })).toEqual({ emoji: '🔥' });
    expect(parseC2S('start', undefined)).toEqual({});
  });
  it('rejects junk', () => {
    expect(parseC2S('shoot', { seq: 3, angle: 1.2, power: 2 })).toBeNull();
    expect(parseC2S('shoot', { seq: -1, angle: 1.2, power: 0.5 })).toBeNull();
    expect(parseC2S('shoot', { seq: 1, angle: 'x', power: 0.5 })).toBeNull();
    expect(parseC2S('slide', { angle: Infinity })).toBeNull();
    expect(parseC2S('join', { code: 'ABIO', playerId: id, nickname: 'x' })).toBeNull();
    expect(parseC2S('join', { code: 'ABCD', playerId: 'nope', nickname: 'x' })).toBeNull();
    expect(parseC2S('react', { emoji: '💩' })).toBeNull();
  });
});

describe('voice payload guard', () => {
  it('accepts a small binary clip with an allowed mime', () => {
    expect(parseVoice({ mime: 'audio/webm;codecs=opus', data: new Uint8Array(100) })).not.toBeNull();
    expect(parseVoice({ mime: 'audio/mp4', data: new ArrayBuffer(10) })).not.toBeNull();
  });
  it('rejects junk, wrong mimes, empty and oversized clips', () => {
    expect(parseVoice(null)).toBeNull();
    expect(parseVoice({ mime: 'text/html', data: new Uint8Array(10) })).toBeNull();
    expect(parseVoice({ mime: 'audio/mp4', data: 'not binary' })).toBeNull();
    expect(parseVoice({ mime: 'audio/mp4', data: new Uint8Array(0) })).toBeNull();
    expect(parseVoice({ mime: 'audio/mp4', data: new Uint8Array(VOICE_MAX_BYTES + 1) })).toBeNull();
  });
});

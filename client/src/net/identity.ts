import { randomName } from '@goli/shared';

const KEY_ID = 'goli.playerId';
const KEY_NICK = 'goli.nickname';
const KEY_ROOM = 'goli.lastRoom';
const KEY_VOICE = 'goli.voice';
const KEY_LISTEN = 'goli.listen';

// localStorage can throw (private mode, blocked storage); fall back to memory.
const memory = new Map<string, string>();
function get(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return memory.get(k) ?? null;
  }
}
function set(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    if (v === null) memory.delete(k);
    else memory.set(k, v);
  }
}

/** crypto.randomUUID only exists on https/localhost; phones on the LAN in dev use plain http. */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function getPlayerId(): string {
  let id = get(KEY_ID);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = uuid();
    set(KEY_ID, id);
  }
  return id;
}

export function getNickname(): string {
  return get(KEY_NICK) ?? randomName();
}
export function hasNickname(): boolean {
  return get(KEY_NICK) !== null;
}
export function saveNickname(n: string) {
  set(KEY_NICK, n);
}

export function getLastRoom(): string | null {
  return get(KEY_ROOM);
}
export function setLastRoom(code: string | null) {
  set(KEY_ROOM, code);
}

/** Mic on during my turns (only set after permission was granted). */
export function getVoicePref(): boolean {
  return get(KEY_VOICE) === '1';
}
export function setVoicePref(on: boolean) {
  set(KEY_VOICE, on ? '1' : null);
}

/** Hear the shooter (on unless turned off). */
export function getListenPref(): boolean {
  return get(KEY_LISTEN) !== '0';
}
export function setListenPref(on: boolean) {
  set(KEY_LISTEN, on ? null : '0');
}

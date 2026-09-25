/** Letters only, without the ambiguous I and O (digits are never used, so no 0/1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function makeRoomCode(rng: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return s;
}

export function isRoomCode(s: unknown): s is string {
  return typeof s === 'string' && CODE_RE.test(s);
}

/** Accept lower-case / padded user input. */
export function normaliseRoomCode(s: string): string {
  return s.trim().toUpperCase();
}

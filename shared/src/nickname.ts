import { NICK_MAX } from './constants';

// Basic, deliberately small filter (English, Hindi, Malayalam). Matched against a
// normalised, letters-only form so "F.u_c k" and leetspeak are caught too.
const BANNED = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'cunt', 'dick', 'slut', 'whore', 'nigg', 'faggot',
  'chutiya', 'chutia', 'madarchod', 'bhenchod', 'behenchod', 'bsdk', 'gandu', 'randi', 'lund', 'bhosdi',
  'myre', 'thayoli', 'kunna', 'pooru', 'thendi', 'poorimon',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
}

export function isProfane(s: string): boolean {
  const n = normalise(s);
  return BANNED.some((w) => n.includes(w));
}

/** Control chars, zero-width / bidi marks, line separators, BOM — and < > for good measure. */
function isStripped(cp: number): boolean {
  return (
    cp <= 0x1f ||
    (cp >= 0x7f && cp <= 0x9f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0xfeff ||
    cp === 0x3c ||
    cp === 0x3e
  );
}

/**
 * Clean a user-supplied nickname: strips control / zero-width characters,
 * collapses whitespace, trims, caps at NICK_MAX characters.
 * Returns null if empty or profane.
 */
export function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = Array.from(raw.normalize('NFC'))
    .filter((ch) => !isStripped(ch.codePointAt(0)!))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = Array.from(cleaned).slice(0, NICK_MAX).join('').trim();
  if (!capped || isProfane(capped)) return null;
  return capped;
}

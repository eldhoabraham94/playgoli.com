import type { RoomInfo } from '@goli/shared';

export async function createRoom(): Promise<{ code: string } | { error: string }> {
  try {
    const r = await fetch('/api/rooms', { method: 'POST' });
    if (r.status === 429) return { error: 'Too many new games from here. Try again in a few minutes.' };
    if (!r.ok) return { error: 'Could not create a game. Try again.' };
    return (await r.json()) as { code: string };
  } catch {
    return { error: 'No connection to the server.' };
  }
}

/** null = room does not exist; undefined = network trouble. */
export async function getRoomInfo(code: string): Promise<RoomInfo | null | undefined> {
  try {
    const r = await fetch(`/api/rooms/${code}`);
    if (r.status === 404) return null;
    if (!r.ok) return undefined;
    return (await r.json()) as RoomInfo;
  } catch {
    return undefined;
  }
}

export function roomLink(code: string): string {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const origin = local && __LAN_ORIGIN__ ? __LAN_ORIGIN__ : location.origin;
  return `${origin}/r/${code}`;
}

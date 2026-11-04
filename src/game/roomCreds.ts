export type RoomCreds = { playerId: string; token: string; name: string };
const key = (code: string) => `chronicles-room-${code.toUpperCase()}`;

export function loadCreds(code: string): RoomCreds | null {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as RoomCreds) : null;
  } catch {
    return null;
  }
}
export function saveCreds(code: string, c: RoomCreds) {
  localStorage.setItem(key(code), JSON.stringify(c));
}

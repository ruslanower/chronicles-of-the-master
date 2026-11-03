import type { GameState } from "@/game/engine";

export type RoomPlayer = { id: string; name: string; heroId: string | null; host: boolean };
export type RoomRow = { code: string; lang: string; host_id: string; phase: string; players: RoomPlayer[]; state: GameState | null; version: number; busy_until: string | null };

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => chars[b % chars.length]).join("");
}

export async function loadRoom(code: string): Promise<RoomRow | null> {
  const db = await admin();
  const { data, error } = await db.from("rooms").select("code, lang, host_id, phase, players, state, version, busy_until").eq("code", code).maybeSingle();
  if (error) throw error;
  return (data as unknown as RoomRow) ?? null;
}

/** Verifies the player's secret token for this room. */
export async function verifyPlayer(code: string, playerId: string, token: string) {
  const db = await admin();
  const { data } = await db.from("room_secrets").select("token_hash, room_code").eq("player_id", playerId).maybeSingle();
  if (!data || data.room_code !== code || data.token_hash !== (await sha256(token))) throw new Error("forbidden");
  const room = await loadRoom(code);
  if (!room) throw new Error("not found");
  return room;
}

/** Optimistic write: only succeeds if nobody changed the room since `version`. */
export async function saveRoom(code: string, version: number, patch: Partial<Omit<RoomRow, "code" | "version">>) {
  const db = await admin();
  const { data, error } = await db
    .from("rooms")
    .update({ ...(patch as Record<string, unknown>), version: version + 1, updated_at: new Date().toISOString() } as never)
    .eq("code", code)
    .eq("version", version)
    .select("version");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Marks the room busy while the Master thinks, so two turns can't run at once. */
export async function claimRoom(room: RoomRow): Promise<number | null> {
  if (room.busy_until && new Date(room.busy_until).getTime() > Date.now()) return null;
  const ok = await saveRoom(room.code, room.version, { busy_until: new Date(Date.now() + 90_000).toISOString() });
  return ok ? room.version + 1 : null;
}

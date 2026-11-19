import fs from "node:fs";
import type { GameState } from "@/game/engine";

export type RoomPlayer = { id: string; name: string; heroId: string | null; host: boolean };
export type RoomRow = {
  code: string;
  lang: string;
  host_id: string;
  phase: string;
  players: RoomPlayer[];
  state: GameState | null;
  version: number;
  busy_until: string | null;
};

export type RoomMessageRow = {
  id: number;
  room_code: string;
  author: string;
  kind: "player" | "master";
  to_master: boolean;
  text: string;
};

type LocalStore = {
  rooms: Record<string, RoomRow>;
  secrets: Record<string, { player_id: string; room_code: string; token_hash: string }>;
  messages: RoomMessageRow[];
  nextMsgId: number;
};

const STORE_FILE = "/tmp/chronicles-rooms-store.json";

declare global {
  var __chroniclesLocalStore: LocalStore | undefined;
}

function getLocalStore(): LocalStore {
  if (!globalThis.__chroniclesLocalStore) {
    let loaded: LocalStore | null = null;
    try {
      if (fs.existsSync(STORE_FILE)) {
        loaded = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as LocalStore;
      }
    } catch {
      loaded = null;
    }
    globalThis.__chroniclesLocalStore = loaded ?? {
      rooms: {},
      secrets: {},
      messages: [],
      nextMsgId: 1,
    };
  }
  return globalThis.__chroniclesLocalStore;
}

function persistLocalStore(): void {
  try {
    if (globalThis.__chroniclesLocalStore) {
      fs.writeFileSync(STORE_FILE, JSON.stringify(globalThis.__chroniclesLocalStore), "utf8");
    }
  } catch {
    // ignore file persistence errors in restricted environments
  }
}

export function hasSupabaseAdmin(): boolean {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

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

export async function createRoomRecord(
  roomInit: { code: string; lang: string; host_id: string; players: RoomPlayer[] },
  secretInit: { player_id: string; room_code: string; token_hash: string },
): Promise<boolean> {
  if (hasSupabaseAdmin()) {
    const db = await admin();
    const { error } = await db.from("rooms").insert(roomInit as never);
    if (error) return false;
    await db.from("room_secrets").insert(secretInit);
    return true;
  }

  const store = getLocalStore();
  if (store.rooms[roomInit.code]) return false;
  store.rooms[roomInit.code] = {
    code: roomInit.code,
    lang: roomInit.lang,
    host_id: roomInit.host_id,
    phase: "lobby",
    players: roomInit.players,
    state: null,
    version: 0,
    busy_until: null,
  };
  store.secrets[secretInit.player_id] = secretInit;
  persistLocalStore();
  return true;
}

export async function insertPlayerSecret(secretInit: {
  player_id: string;
  room_code: string;
  token_hash: string;
}): Promise<void> {
  if (hasSupabaseAdmin()) {
    const db = await admin();
    await db.from("room_secrets").insert(secretInit);
    return;
  }
  const store = getLocalStore();
  store.secrets[secretInit.player_id] = secretInit;
  persistLocalStore();
}

export async function insertRoomMessage(msg: {
  room_code: string;
  author: string;
  kind: "player" | "master";
  to_master?: boolean;
  text: string;
}): Promise<void> {
  if (hasSupabaseAdmin()) {
    const db = await admin();
    await db.from("room_messages").insert({
      room_code: msg.room_code,
      author: msg.author,
      kind: msg.kind,
      to_master: Boolean(msg.to_master),
      text: msg.text,
    });
    return;
  }
  const store = getLocalStore();
  store.messages.push({
    id: store.nextMsgId++,
    room_code: msg.room_code,
    author: msg.author,
    kind: msg.kind,
    to_master: Boolean(msg.to_master),
    text: msg.text,
  });
  if (store.messages.length > 800) {
    store.messages = store.messages.slice(-600);
  }
  persistLocalStore();
}

export async function loadRoomMessages(code: string, limit = 80): Promise<RoomMessageRow[]> {
  if (hasSupabaseAdmin()) {
    const db = await admin();
    const { data } = await db
      .from("room_messages")
      .select("id, room_code, author, kind, to_master, text")
      .eq("room_code", code)
      .order("id", { ascending: false })
      .limit(limit);
    return ((data ?? []) as unknown as RoomMessageRow[]).reverse();
  }
  const store = getLocalStore();
  return store.messages.filter((m) => m.room_code === code).slice(-limit);
}

export async function loadRoom(code: string): Promise<RoomRow | null> {
  if (hasSupabaseAdmin()) {
    const db = await admin();
    const { data, error } = await db
      .from("rooms")
      .select("code, lang, host_id, phase, players, state, version, busy_until")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as RoomRow) ?? null;
  }
  const store = getLocalStore();
  const room = store.rooms[code];
  return room ? structuredClone(room) : null;
}

/** Verifies the player's secret token for this room. */
export async function verifyPlayer(code: string, playerId: string, token: string) {
  if (hasSupabaseAdmin()) {
    const db = await admin();
    const { data } = await db
      .from("room_secrets")
      .select("token_hash, room_code")
      .eq("player_id", playerId)
      .maybeSingle();
    if (!data || data.room_code !== code || data.token_hash !== (await sha256(token)))
      throw new Error("forbidden");
  } else {
    const store = getLocalStore();
    const data = store.secrets[playerId];
    if (!data || data.room_code !== code || data.token_hash !== (await sha256(token)))
      throw new Error("forbidden");
  }
  const room = await loadRoom(code);
  if (!room) throw new Error("not found");
  return room;
}

/** Optimistic write: only succeeds if nobody changed the room since `version`. */
export async function saveRoom(
  code: string,
  version: number,
  patch: Partial<Omit<RoomRow, "code" | "version">>,
) {
  if (hasSupabaseAdmin()) {
    const db = await admin();
    const { data, error } = await db
      .from("rooms")
      .update({
        ...(patch as Record<string, unknown>),
        version: version + 1,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("code", code)
      .eq("version", version)
      .select("version");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  const store = getLocalStore();
  const current = store.rooms[code];
  if (!current || current.version !== version) return false;
  store.rooms[code] = {
    ...current,
    ...patch,
    version: version + 1,
  };
  persistLocalStore();
  return true;
}

/** Marks the room busy while the Master thinks, so two turns can't run at once. */
export async function claimRoom(room: RoomRow): Promise<number | null> {
  if (room.busy_until && new Date(room.busy_until).getTime() > Date.now()) return null;
  const ok = await saveRoom(room.code, room.version, {
    busy_until: new Date(Date.now() + 35_000).toISOString(),
  });
  return ok ? room.version + 1 : null;
}

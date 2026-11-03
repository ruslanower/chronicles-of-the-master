CREATE TABLE public.rooms (
  code text PRIMARY KEY,
  lang text NOT NULL DEFAULT 'uk',
  host_id uuid NOT NULL,
  phase text NOT NULL DEFAULT 'lobby',
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  state jsonb,
  version integer NOT NULL DEFAULT 0,
  busy_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rooms are readable by code" ON public.rooms FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.room_secrets (
  player_id uuid PRIMARY KEY,
  room_code text NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.room_secrets TO service_role;
ALTER TABLE public.room_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.room_messages (
  id bigserial PRIMARY KEY,
  room_code text NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  author text NOT NULL,
  kind text NOT NULL DEFAULT 'player',
  to_master boolean NOT NULL DEFAULT false,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_messages_room_idx ON public.room_messages(room_code, id);
GRANT SELECT ON public.room_messages TO anon, authenticated;
GRANT ALL ON public.room_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.room_messages_id_seq TO service_role;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room messages are readable" ON public.room_messages FOR SELECT TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
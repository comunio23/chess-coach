-- Schema für das Supabase-Projekt "chess-coach-partien"
-- Anwenden im SQL-Editor des neuen Projekts (oder per mcp__supabase__apply_migration,
-- sobald die MCP-Verbindung auf dieses Projekt zeigt).

create table if not exists partien (
  id                uuid primary key default gen_random_uuid(),
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now(),

  -- Kopfdaten (filterbare Spalten)
  datum             date,
  veranstaltung     text default '',
  brett             integer,
  verein_weiss      text default '',
  verein_schwarz    text default '',
  spieler_weiss     text default '',
  spieler_schwarz   text default '',
  elo_weiss         integer,
  elo_schwarz       integer,
  ergebnis          text default '',        -- '1-0' | '0-1' | '1/2-1/2' | '*'

  -- Zugdaten
  zuege             jsonb not null default '[]'::jsonb,
  pgn               text default '',

  -- OCR-Metadaten
  ocr_status        text not null default 'auto',   -- 'auto' | 'korrigiert' | 'manuell'
  ocr_rohantwort    jsonb,
  formular_foto_pfad text,

  quelle            text default 'foto'   -- 'foto' | 'telegram' | 'manuell'
);

create index if not exists idx_partien_datum on partien (datum);
create index if not exists idx_partien_verein_weiss on partien (verein_weiss);
create index if not exists idx_partien_verein_schwarz on partien (verein_schwarz);
create index if not exists idx_partien_spieler_weiss on partien (spieler_weiss);
create index if not exists idx_partien_spieler_schwarz on partien (spieler_schwarz);
create index if not exists idx_partien_veranstaltung on partien (veranstaltung);

create or replace function set_aktualisiert_am()
returns trigger as $$
begin
  new.aktualisiert_am = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_partien_aktualisiert_am
  before update on partien
  for each row execute function set_aktualisiert_am();

-- Row Level Security: kein anon-full-access (KMS-Learning L-0073/L-0088),
-- Zugriff nur fuer authentifizierte Nutzer (Single-Login via Supabase Auth).
alter table partien enable row level security;

create policy "authenticated_select_partien" on partien
  for select to authenticated using (true);

create policy "authenticated_insert_partien" on partien
  for insert to authenticated with check (true);

create policy "authenticated_update_partien" on partien
  for update to authenticated using (true) with check (true);

create policy "authenticated_delete_partien" on partien
  for delete to authenticated using (true);

-- Die Edge Function ocr-partie nutzt den Service-Role-Key (server-seitig,
-- Deno.env) und umgeht RLS bewusst fuer den automatischen INSERT nach OCR.
-- Das Telegram-Foto-Handling laeuft ebenfalls ueber die Edge Function,
-- braucht also KEINE eigene "anon insert"-Policy.

-- Storage-Bucket fuer Partieformular-Fotos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partieformulare', 'partieformulare', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

-- Storage ist NICHT public (anders als Fuhrpark) -- Fotos koennen
-- personenbezogene Daten (Namen, Vereine) enthalten.
create policy "partien_authenticated_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'partieformulare');

create policy "partien_authenticated_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'partieformulare');

create policy "partien_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'partieformulare');

create policy "partien_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'partieformulare');

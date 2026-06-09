-- MonSalon — Schéma Supabase v2 (clients + revenus séparés)
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- ATTENTION : supprime les anciennes tables si vous migrez depuis v1

DROP TABLE IF EXISTS public.revenus CASCADE;
DROP TABLE IF EXISTS public.rdvs CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.depenses CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 1. settings
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.settings (key, value) VALUES ('monthly_rent', '250');

-- ─────────────────────────────────────────────────────────────
-- 2. clients (registre unique — téléphone = identifiant)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        TEXT NOT NULL,
  telephone  TEXT UNIQUE,
  genre      TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- 3. rdvs (créés avant revenus — FK revenus.rdv_id → rdvs)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.rdvs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                 DATE NOT NULL,
  heure                TEXT,
  client_id            UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  client_nom_snapshot  TEXT NOT NULL,
  telephone_snapshot   TEXT,
  genre_snapshot       TEXT,
  style                TEXT,
  montant              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  duree                TEXT,
  note                 TEXT,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'completed', 'deleted')),
  encaisse             BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- 4. revenus (encaissements)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.revenus (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                 DATE NOT NULL,
  client_id            UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  client_nom_snapshot  TEXT NOT NULL,
  telephone_snapshot   TEXT,
  genre_snapshot       TEXT,
  montant              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note                 TEXT,
  rdv_id               UUID REFERENCES public.rdvs (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- 5. depenses
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.depenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL,
  description TEXT NOT NULL,
  montant     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- Index
-- ─────────────────────────────────────────────────────────────

CREATE INDEX idx_clients_telephone ON public.clients (telephone) WHERE deleted_at IS NULL;
CREATE INDEX idx_revenus_date ON public.revenus (date DESC);
CREATE INDEX idx_revenus_rdv_id ON public.revenus (rdv_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_rdvs_date ON public.rdvs (date ASC, heure ASC);
CREATE INDEX idx_rdvs_client_id ON public.rdvs (client_id);
CREATE INDEX idx_depenses_date ON public.depenses (date DESC);

-- ─────────────────────────────────────────────────────────────
-- RLS (accès anon — app privée, clé anon uniquement côté frontend)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenus  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdvs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_settings" ON public.settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_clients"  ON public.clients  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_revenus"  ON public.revenus  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_rdvs"     ON public.rdvs     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_depenses" ON public.depenses FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "auth_settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_clients"  ON public.clients  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_revenus"  ON public.revenus  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_rdvs"     ON public.rdvs     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_depenses" ON public.depenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

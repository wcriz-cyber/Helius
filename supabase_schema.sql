-- ═══════════════════════════════════════════════════════════
--  5X TRADING APP — SUPABASE SCHEMA COMPLETO
--  Ejecuta este script en: Supabase → SQL Editor → New query
--  Última actualización: app 100% manual, sin bot automático
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────
-- 1. KV STORE — almacén clave/valor genérico
--    Usado para: slots, strategyParams, historial,
--    configuración, modos de slots, órdenes activas, etc.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kv_store (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kv_key ON kv_store (key text_pattern_ops);

-- ─────────────────────────────────────────────────────────
-- 2. WHITELIST — control de acceso de usuarios
--    Cada usuario registrado por el admin tiene un registro aquí
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whitelist (
  user_id     TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  password    TEXT,
  name        TEXT,
  note        TEXT,
  role        TEXT DEFAULT 'user',   -- 'user' | 'admin'
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- 3. SUPPORT MESSAGES — chat admin ↔ usuario
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_messages (
  id            BIGSERIAL PRIMARY KEY,
  user_key      TEXT NOT NULL DEFAULT 'anonymous',
  user_name     TEXT,
  text          TEXT,
  sender        TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  read          BOOLEAN DEFAULT FALSE,
  read_by_admin BOOLEAN DEFAULT FALSE,
  type          TEXT DEFAULT 'text',           -- 'text' | 'file'
  file_url      TEXT,
  file_name     TEXT,
  file_type     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sm_user    ON support_messages (user_key);
CREATE INDEX IF NOT EXISTS idx_sm_created ON support_messages (created_at);

-- ─────────────────────────────────────────────────────────
-- 4. TRADE HISTORY — historial global de operaciones
--    Una fila por operación cerrada (para panel admin)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_history (
  id            BIGSERIAL PRIMARY KEY,
  user_key      TEXT NOT NULL,
  coin          TEXT NOT NULL,
  symbol        TEXT,
  slot_index    INTEGER,
  profit        NUMERIC(12,4),
  profit_usdt   NUMERIC(12,4),
  roi           TEXT,
  entry_price   NUMERIC(20,8),
  exit_price    NUMERIC(20,8),
  avg_price     NUMERIC(20,8),
  total_spent   NUMERIC(12,4),
  levels_filled INTEGER,
  is_partial    BOOLEAN DEFAULT FALSE,
  label         TEXT,          -- 'TP1' | 'TRAIL' | 'MARKET'
  rebuy_cycle   SMALLINT DEFAULT 0,
  trade_date    TEXT,
  trade_time    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_th_user    ON trade_history (user_key);
CREATE INDEX IF NOT EXISTS idx_th_created ON trade_history (created_at);

-- ─────────────────────────────────────────────────────────
-- 5. STORAGE BUCKET para archivos de soporte
--    Crear manualmente en: Storage → New bucket
--    Nombre: support-files
--    Public: SÍ (para que las URLs funcionen sin auth)
-- ─────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════

ALTER TABLE kv_store          ENABLE ROW LEVEL SECURITY;
ALTER TABLE whitelist         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history     ENABLE ROW LEVEL SECURITY;

-- La app usa Anon Key directamente (sin auth de usuarios).
-- Política: permitir TODO con Anon Key.
-- La seguridad la maneja el PIN/contraseña de la app.
CREATE POLICY "anon_all_kv" ON kv_store         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_wl" ON whitelist         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_sm" ON support_messages  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_th" ON trade_history     FOR ALL TO anon USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════
--  EDGE FUNCTION — Gate.io Proxy (TypeScript)
--  Archivo: supabase/functions/gate-proxy/index.ts
--  Deploy: supabase functions deploy gate-proxy
--
--  Variables de entorno (Supabase Dashboard → Settings → Edge Functions):
--    GATE_API_KEY      → API Key de Gate.io del usuario
--    GATE_API_SECRET   → API Secret de Gate.io del usuario
--    SUPABASE_URL      → (auto-inyectada)
--    SUPABASE_ANON_KEY → (auto-inyectada)
-- ═══════════════════════════════════════════════════════════

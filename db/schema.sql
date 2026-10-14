-- ============================================================
--  Neon Postgres / 旋转审计与持久化
--  执行方式：node scripts/migrate.mjs
--  或在 Neon SQL Editor 中直接粘贴执行（脚本与本文件等价）
-- ============================================================

create table if not exists slot_sessions (
  id            text primary key,
  game_id       text not null,
  bet           numeric(14, 2) not null,
  lines         integer not null,
  balance       numeric(14, 2) not null,
  client_seed   text,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create table if not exists slot_spins (
  id              bigserial primary key,
  round_id        text not null,
  session_id      text,
  game_id         text not null,
  config_version  text,
  phase           text not null,
  bet             numeric(14, 2) not null,
  cost            numeric(14, 2) not null,
  total_win       numeric(14, 2) not null,
  multiplier      numeric(10, 2) not null default 1,
  triggered       jsonb not null default '[]'::jsonb,
  balance_after   numeric(14, 2) not null,
  server_seed_hash text,
  client_seed     text,
  nonce           bigint,
  created_at      timestamptz not null default now()
);

create index if not exists idx_slot_spins_game on slot_spins (game_id);
create index if not exists idx_slot_spins_session on slot_spins (session_id);
create index if not exists idx_slot_spins_created on slot_spins (created_at desc);

-- 排行榜：以「单次旋转最高倍率」排序，幂等 upsert
create table if not exists slot_leaderboard (
  game_id         text not null,
  session_id      text not null,
  round_id        text not null,
  best_multiplier numeric(12, 2) not null default 0,
  best_win        numeric(14, 2) not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (game_id, session_id)
);

create index if not exists idx_slot_leaderboard_game on slot_leaderboard (game_id, best_multiplier desc);

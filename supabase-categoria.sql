-- =====================================================================
-- Mi Fútbol JV32 · CATEGORÍA DEL EQUIPO (v10.1)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo. No borra nada.
-- La categoría marca cuánto dura cada parte (prebenjamín 25', benjamín 30',
-- alevín 35', infantil 40', cadete en adelante 45').
-- =====================================================================
alter table public.equipos
  add column if not exists categoria text;
alter table public.equipos
  drop constraint if exists equipos_categoria_check;
alter table public.equipos
  add constraint equipos_categoria_check
  check (categoria is null or categoria in ('prebenjamin','benjamin','alevin','infantil','cadete','juvenil','senior'));

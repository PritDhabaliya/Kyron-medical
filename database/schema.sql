-- Supabase-compatible schema (PostgreSQL)
create extension if not exists pgcrypto;

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  dob date,
  phone text not null unique,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  specialty text not null,
  body_part text not null,
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  doctor_id uuid not null references doctors(id) on delete cascade,
  appointment_date date not null,
  appointment_time time not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (doctor_id, appointment_date, appointment_time)
);

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete set null,
  session_id text not null unique,
  conversation_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_session_id on chat_sessions(session_id);


-- Smart Patient Queue & Medicine Reminder System
create extension if not exists "pgcrypto";

create type user_role as enum ('patient','doctor');
create type appointment_status as enum ('waiting','in-progress','completed');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  role user_role not null default 'patient',
  created_at timestamptz default now()
);

create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references profiles(id) on delete cascade,
  specialization text not null default 'General Medicine',
  available_slots text[] default '{}'
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references profiles(id) on delete cascade not null,
  doctor_id uuid references doctors(id) on delete cascade not null,
  date date not null,
  time_slot text not null,
  token_number integer not null,
  status appointment_status not null default 'waiting',
  created_at timestamptz default now()
);

create unique index if not exists unique_doctor_slot
on appointments(doctor_id, date, time_slot)
where status <> 'completed';

create table if not exists medicine_reminders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references profiles(id) on delete cascade not null,
  medicine_name text not null,
  dosage text not null,
  reminder_time time not null,
  frequency text not null default 'Daily',
  active boolean default true
);

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid unique references appointments(id) on delete cascade,
  notes text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table doctors enable row level security;
alter table appointments enable row level security;
alter table medicine_reminders enable row level security;
alter table prescriptions enable row level security;

-- Prototype policies. Tighten these further for production.
create policy "profiles self read" on profiles for select using (auth.uid() = id);
create policy "profiles self insert" on profiles for insert with check (auth.uid() = id);
create policy "doctors public read" on doctors for select using (true);
create policy "appointments own read" on appointments for select using (auth.uid() = patient_id);
create policy "appointments patient insert" on appointments for insert with check (auth.uid() = patient_id);
create policy "reminders own" on medicine_reminders for all using (auth.uid() = patient_id) with check (auth.uid() = patient_id);
create policy "prescriptions own read" on prescriptions for select using (
  exists (select 1 from appointments a where a.id = appointment_id and a.patient_id = auth.uid())
);

-- Enable realtime for queue updates.
alter publication supabase_realtime add table appointments;

-- After creating a doctor auth account, add:
-- insert into profiles(id,name,email,role) values ('AUTH_USER_UUID','Dr. Priya','doctor@example.com','doctor');
-- insert into doctors(user_id,specialization,available_slots)
-- values ('AUTH_USER_UUID','General Medicine',array['09:00','09:30','10:00','10:30','11:00','11:30']);

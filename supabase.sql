create table if not exists abq_backups (
  email text primary key,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table abq_backups enable row level security;

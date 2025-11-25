-- Create storage bucket for paper PDFs
insert into storage.buckets (id, name, public)
values ('papers-pdf', 'papers-pdf', false);

-- Create papers table
create table papers (
  id uuid primary key default gen_random_uuid(),
  title text,
  filename text not null,
  storage_path text not null,
  parsed_path text,
  file_size bigint,
  content_type text,
  sha256 text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index on SHA for deduplication lookups
create index papers_sha256_idx on papers (sha256);

-- Trigger to auto-update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger papers_updated_at
  before update on papers
  for each row
  execute function update_updated_at_column();

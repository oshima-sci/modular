-- Create extract_links table for storing relationships between extracts
create table extract_links (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references extracts(id) on delete cascade,
  to_id uuid not null references extracts(id) on delete cascade,
  content jsonb not null,  -- link_type, reasoning, etc.
  job_id uuid references jobs(id) on delete set null,
  created_at timestamptz default now()
);

-- Indexes for common queries
create index extract_links_from_id_idx on extract_links(from_id);
create index extract_links_to_id_idx on extract_links(to_id);
create index extract_links_job_id_idx on extract_links(job_id);

-- Prevent duplicate links (same from/to pair)
create unique index extract_links_from_to_unique on extract_links(from_id, to_id);

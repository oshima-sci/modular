-- Create libraries table
create table libraries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index on owner for fetching user's libraries
create index libraries_owner_id_idx on libraries (owner_id);

-- Trigger to auto-update updated_at
create trigger libraries_updated_at
  before update on libraries
  for each row
  execute function update_updated_at_column();

-- Create join table for papers <-> libraries (many-to-many)
create table library_papers (
  library_id uuid not null references libraries(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (library_id, paper_id)
);

-- Indexes for efficient lookups in both directions
create index library_papers_library_id_idx on library_papers (library_id);
create index library_papers_paper_id_idx on library_papers (paper_id);

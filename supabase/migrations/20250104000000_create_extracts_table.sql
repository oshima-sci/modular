-- Create extracts table for storing LLM extraction results
create table extracts (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  type text not null,  -- 'claim', 'method', 'observation'
  content jsonb not null,
  created_at timestamptz default now()
);

-- Indexes for common queries
create index extracts_paper_id_idx on extracts(paper_id);
create index extracts_job_id_idx on extracts(job_id);

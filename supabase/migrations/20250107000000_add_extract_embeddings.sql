-- Enable pgvector extension if not already enabled
create extension if not exists vector with schema extensions;

-- Create separate table for extract embeddings
-- This keeps the extracts table lean and makes vector operations explicit
create table extract_vectors (
  id uuid primary key default gen_random_uuid(),
  extract_id uuid not null references extracts(id) on delete cascade,
  embedding extensions.vector(1536) not null,
  created_at timestamptz default now(),

  -- Each extract can only have one embedding
  unique(extract_id)
);

-- Index for fast similarity search (HNSW is recommended for most use cases)
create index extract_vectors_embedding_idx on extract_vectors
using hnsw (embedding extensions.vector_cosine_ops);

-- Index for looking up by extract_id
create index extract_vectors_extract_id_idx on extract_vectors(extract_id);

-- RPC function to find similar claims within a library
create or replace function get_similar_claims(
  query_embedding extensions.vector(1536),
  target_library_id uuid,
  match_threshold float default 0.7,
  match_count int default 20
)
returns table (
  id uuid,
  paper_id uuid,
  content jsonb,
  similarity float
)
language sql stable
as $$
  select
    e.id,
    e.paper_id,
    e.content,
    1 - (ev.embedding <=> query_embedding) as similarity
  from extracts e
  join extract_vectors ev on e.id = ev.extract_id
  join library_papers lp on e.paper_id = lp.paper_id
  where lp.library_id = target_library_id
    and e.type = 'claim'
    and 1 - (ev.embedding <=> query_embedding) > match_threshold
  order by ev.embedding <=> query_embedding
  limit match_count;
$$;

-- Create papers bucket (stores both original PDFs and parsed TEI files)
-- Structure: {paper_id}/original.pdf, {paper_id}/parsed.tei
-- Note: papers-pdf bucket is deprecated, use papers going forward

insert into storage.buckets (id, name, public) values ('papers', 'papers', false);

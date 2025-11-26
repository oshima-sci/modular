-- Make owner_id nullable on libraries table
alter table libraries alter column owner_id drop not null;

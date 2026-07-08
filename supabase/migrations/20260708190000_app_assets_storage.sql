-- Bucket public pour le logo entreprise (lecture anonyme, écriture via service role API)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets',
  'app-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "app_assets_public_read" on storage.objects;
create policy "app_assets_public_read"
on storage.objects for select
to public
using (bucket_id = 'app-assets');

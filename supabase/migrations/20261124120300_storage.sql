-- Hawa AI · 004 · Private storage for civic report images
--
-- Object path convention: <user_id>/<report_id>/<file name>
-- Users can upload only into their own folder and only for a report they own
-- that is still 'submitted'. Objects cannot be overwritten (no UPDATE policy).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-media',
  'report-media',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Report media: owners upload to their open reports"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.civic_reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.user_id = (select auth.uid())
        and r.status = 'submitted'
    )
  );

create policy "Report media: owners read their files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Report media: owners delete their files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

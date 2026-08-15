-- Fed Navigator is single-brand. No client logo, client name, or per-client
-- accent colour is rendered anywhere in the product, so the two columns that
-- backed co-branding are dead. The accent strips and tile hairlines stay —
-- they now read the --brand token (#3080C2) in src/app/globals.css.
--
-- NOTE: the `client-logos` storage bucket is orphaned by this migration.
-- Nothing writes to it (the upload action is gone) and nothing reads from it
-- (logo_url is gone). Delete the bucket and its objects from the Supabase
-- dashboard when you're satisfied nothing else depends on it.

alter table clients drop column if exists logo_url;
alter table clients drop column if exists accent_color;

# Supabase public database CA

`prod-ca-2021.crt` downloaded over HTTPS from
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

The URL template is published in the official dashboard source:
https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json
(`ssl:certificate_url`). This public certificate is used only by the migration
runner and is not a credential. It enables certificate and hostname validation
for the shared pooler without changing the system trust store.

-- ═══════════════════════════════════════════════════════════════════════════
-- open-autoDM - Security Hardening & Owner Scoping Migration
--
-- 1. app_settings: Record installation owner (owner_user_id) to prevent
--    unauthorized non-owner users from overwriting global Meta credentials.
-- 2. storage.objects: Restrict card image deletion to the uploading owner.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Installation Owner on app_settings ──────────────────────────────────
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_settings_owner_user_id ON public.app_settings(owner_user_id);

-- If there is already an existing user in auth.users and app_settings is completed,
-- default owner_user_id to the oldest profile/user to preserve existing setup.
UPDATE public.app_settings
SET owner_user_id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1)
WHERE id = 1 AND owner_user_id IS NULL AND setup_completed = true;

-- ── 2. Storage Image Deletion Policy Fix ───────────────────────────────────
-- Drop the overly permissive deletion policy that allowed any authenticated user
-- to delete any card image.
DROP POLICY IF EXISTS "Auth users delete card images" ON storage.objects;
DROP POLICY IF EXISTS "Auth users delete own card images" ON storage.objects;

-- Re-create with strict ownership check (user can only delete their own uploads).
-- Supabase Storage schemas use 'owner' (UUID) or 'owner_id' (text). Dynamically
-- adapt to the column present on this database to guarantee idempotent execution.
DO $$
DECLARE
  has_owner_id BOOLEAN;
  has_owner BOOLEAN;
  using_clause TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner_id'
  ) INTO has_owner_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner'
  ) INTO has_owner;

  IF has_owner_id AND has_owner THEN
    using_clause := 'bucket_id = ''card-images'' AND (owner = auth.uid() OR owner_id = (SELECT auth.uid()::text))';
  ELSIF has_owner_id THEN
    using_clause := 'bucket_id = ''card-images'' AND (owner_id = (SELECT auth.uid()::text))';
  ELSE
    using_clause := 'bucket_id = ''card-images'' AND (owner = auth.uid())';
  END IF;

  EXECUTE format(
    'CREATE POLICY "Auth users delete own card images" ON storage.objects FOR DELETE TO authenticated USING (%s)',
    using_clause
  );
END $$;


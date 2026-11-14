import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Card Image Storage Deletion Policy', () => {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20260731000001_security_hardening.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  it('drops the insecure deletion policy that permitted deleting all card images', () => {
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "Auth users delete card images" ON storage.objects;');
  });

  it('creates the owner-restricted deletion policy for bucket card-images', () => {
    expect(migrationSql).toContain('CREATE POLICY "Auth users delete own card images" ON storage.objects FOR DELETE TO authenticated');
    expect(migrationSql).toContain("bucket_id = ''card-images''");
  });

  it('enforces that the deleter must match auth.uid() owner identity', () => {
    // Verifies either owner = auth.uid() or owner_id = auth.uid()::text
    expect(migrationSql).toMatch(/owner\s*=\s*auth\.uid\(\)/);
    expect(migrationSql).toMatch(/owner_id\s*=\s*\(SELECT\s*auth\.uid\(\)::text\)/);
  });

  it('simulates storage delete evaluation between two distinct users', () => {
    const aliceUserId = '11111111-1111-4111-8111-111111111111';
    const bobUserId = '22222222-2222-4222-8222-222222222222';

    const cardImageObject = {
      bucket_id: 'card-images',
      name: `${aliceUserId}/test-card.jpg`,
      owner: aliceUserId,
      owner_id: aliceUserId,
    };

    // Policy predicate implementation mirroring the Postgres RLS USING clause:
    // bucket_id = 'card-images' AND (owner = auth.uid() OR owner_id = auth.uid()::text)
    function canDelete(object: typeof cardImageObject, currentAuthUid: string): boolean {
      if (object.bucket_id !== 'card-images') return false;
      return object.owner === currentAuthUid || object.owner_id === currentAuthUid;
    }

    // Owner Alice can delete her own image
    expect(canDelete(cardImageObject, aliceUserId)).toBe(true);

    // Non-owner Bob cannot delete Alice's image
    expect(canDelete(cardImageObject, bobUserId)).toBe(false);
  });
});

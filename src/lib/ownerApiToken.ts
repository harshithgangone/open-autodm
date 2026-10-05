import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Optional headless owner credential. Deployment stores only its SHA-256 hash. */
export function ownerIdForApiToken(token: string): string | null {
  const expected = process.env.OWNER_API_TOKEN_HASH;
  const userId = process.env.OWNER_API_USER_ID;
  if (
    !/^adm_[a-f0-9]{64}$/.test(token) ||
    !expected ||
    !/^[a-f0-9]{64}$/i.test(expected) ||
    !z.string().uuid().safeParse(userId).success
  ) return null;

  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(actual, Buffer.from(expected, "hex")) ? userId! : null;
}

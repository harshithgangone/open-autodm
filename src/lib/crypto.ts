/**
 * AES-256-GCM encryption for secrets at rest (Instagram tokens, Meta App Secret).
 *
 * Output format: iv_hex:ciphertext_hex:authtag_hex — self-contained.
 * Runs on the Node runtime (Vercel) and on Cloudflare Workers via the
 * `nodejs_compat` flag (node:crypto is supported by workerd).
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV — recommended for GCM
const AUTH_TAG_LENGTH = 16;

function keyFromHex(encryptionKeyHex: string): Buffer {
  const key = Buffer.from(encryptionKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes (64 hex characters)');
  }
  return key;
}

export function encrypt(plaintext: string, encryptionKeyHex: string): string {
  const key = keyFromHex(encryptionKeyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decrypt(encryptedString: string, encryptionKeyHex: string): string {
  const key = keyFromHex(encryptionKeyHex);
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format — expected iv:ciphertext:authTag');
  }
  const [ivHex, ciphertextHex, authTagHex] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(), // throws if the auth tag is invalid (tampered data)
  ]);
  return decrypted.toString('utf8');
}

/** Constant-time comparison — prevents timing attacks on webhook signatures. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** HMAC-SHA256 hex digest — used for Meta webhook signature verification. */
export function hmacSha256Hex(secret: string, payload: Buffer | string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Cryptographically-random hex token (verify tokens, state nonces). */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}

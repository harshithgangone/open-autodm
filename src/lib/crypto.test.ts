import { describe, it, expect } from 'vitest';
import { safeCompare, encrypt, decrypt, hmacSha256Hex, randomToken } from './crypto';

describe('crypto', () => {
  const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  describe('safeCompare', () => {
    it('returns true for identical strings', () => {
      expect(safeCompare('secret_token_123', 'secret_token_123')).toBe(true);
      expect(safeCompare('', '')).toBe(true);
    });

    it('returns false for different strings of same length', () => {
      expect(safeCompare('secret_token_123', 'secret_token_456')).toBe(false);
    });

    it('returns false for different strings of different lengths', () => {
      expect(safeCompare('short', 'longer_string')).toBe(false);
      expect(safeCompare('prefix', 'prefix_extra')).toBe(false);
      expect(safeCompare('', 'non_empty')).toBe(false);
    });
  });

  describe('encrypt and decrypt', () => {
    it('encrypts and successfully decrypts plaintext', () => {
      const plaintext = 'EAABwz_secret_meta_token_value_xyz';
      const ciphertext = encrypt(plaintext, validKey);
      expect(ciphertext).not.toBe(plaintext);
      expect(ciphertext.split(':').length).toBe(3); // iv:ciphertext:authTag

      const decrypted = decrypt(ciphertext, validKey);
      expect(decrypted).toBe(plaintext);
    });

    it('throws error when ciphertext is tampered', () => {
      const ciphertext = encrypt('sensitive data', validKey);
      const parts = ciphertext.split(':');
      const iv = parts[0] ?? '';
      const body = parts[1] ?? '';
      const tag = parts[2] ?? '';
      // Tamper with the ciphertext body
      const tampered = `${iv}:deadbeef${body.slice(8)}:${tag}`;
      expect(() => decrypt(tampered, validKey)).toThrow();
    });

    it('throws error when wrong key is used for decryption', () => {
      const wrongKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const ciphertext = encrypt('sensitive data', validKey);
      expect(() => decrypt(ciphertext, wrongKey)).toThrow();
    });

    it('rejects invalid key lengths', () => {
      expect(() => encrypt('data', 'short_key')).toThrow(/exactly 32 bytes/);
    });
  });

  describe('hmacSha256Hex', () => {
    it('computes correct sha256 HMAC digest', () => {
      const secret = 'test_secret';
      const payload = '{"object":"instagram"}';
      const hmac = hmacSha256Hex(secret, payload);
      expect(typeof hmac).toBe('string');
      expect(hmac.length).toBe(64); // 256 bits = 64 hex chars
      expect(safeCompare(hmac, hmacSha256Hex(secret, payload))).toBe(true);
      expect(safeCompare(hmac, hmacSha256Hex('other_secret', payload))).toBe(false);
    });
  });

  describe('randomToken', () => {
    it('generates random hex strings of specified byte length', () => {
      const token1 = randomToken(16);
      const token2 = randomToken(16);
      expect(token1.length).toBe(32);
      expect(token2.length).toBe(32);
      expect(token1).not.toBe(token2);
    });
  });
});

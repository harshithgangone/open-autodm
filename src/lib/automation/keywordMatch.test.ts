import { describe, it, expect } from 'vitest';
import { keywordMatches } from './keywordMatch';

describe('keywordMatches', () => {
  describe('Standard English Words & Punctuation', () => {
    it('matches exact lowercase keyword', () => {
      expect(keywordMatches('price', ['price'])).toBe(true);
    });

    it('matches case-insensitively', () => {
      expect(keywordMatches('PRICE', ['price'])).toBe(true);
      expect(keywordMatches('price', ['PRICE'])).toBe(true);
      expect(keywordMatches('PrIcE', ['pRiCe'])).toBe(true);
    });

    it('matches when surrounded by common punctuation', () => {
      expect(keywordMatches('what is the price?', ['price'])).toBe(true);
      expect(keywordMatches('price!', ['price'])).toBe(true);
      expect(keywordMatches('price, please', ['price'])).toBe(true);
      expect(keywordMatches('(price)', ['price'])).toBe(true);
      expect(keywordMatches('"price"', ['price'])).toBe(true);
      expect(keywordMatches('price...', ['price'])).toBe(true);
    });

    it('rejects partial word matches (false positives)', () => {
      expect(keywordMatches('priceless', ['price'])).toBe(false);
      expect(keywordMatches('overpriced', ['price'])).toBe(false);
      expect(keywordMatches('reprice', ['price'])).toBe(false);
      expect(keywordMatches('apprice', ['price'])).toBe(false);
    });
  });

  describe('Hashtags & Symbols', () => {
    it('matches hashtag keywords', () => {
      expect(keywordMatches('#price', ['#price'])).toBe(true);
      expect(keywordMatches('#PRICE!', ['#price'])).toBe(true);
      expect(keywordMatches('check out #price today', ['#price'])).toBe(true);
    });

    it('rejects malformed or embedded hashtags', () => {
      expect(keywordMatches('check ##price today', ['#price'])).toBe(false);
      expect(keywordMatches('check foo#price today', ['#price'])).toBe(false);
      expect(keywordMatches('#priceless', ['#price'])).toBe(false);
    });
  });

  describe('Unicode & Non-Latin Scripts', () => {
    it('matches accented Latin characters', () => {
      expect(keywordMatches('welcome to the café!', ['café'])).toBe(true);
      expect(keywordMatches('CAFÉ', ['café'])).toBe(true);
      expect(keywordMatches('cafeteria', ['café'])).toBe(false);
    });

    it('matches Indic / Devanagari script (Hindi)', () => {
      expect(keywordMatches('मुझे लिंक चाहिए', ['लिंक'])).toBe(true);
      expect(keywordMatches('लिंक!', ['लिंक'])).toBe(true);
      expect(keywordMatches('अलिंक', ['लिंक'])).toBe(false);
    });

    it('matches Cyrillic script', () => {
      expect(keywordMatches('Привет друг!', ['привет'])).toBe(true);
      expect(keywordMatches('неприветливый', ['привет'])).toBe(false);
    });
  });

  describe('Emojis', () => {
    it('matches standalone emoji keywords', () => {
      expect(keywordMatches('🔥', ['🔥'])).toBe(true);
      expect(keywordMatches('send 🔥 please', ['🔥'])).toBe(true);
      expect(keywordMatches('🔥!', ['🔥'])).toBe(true);
      expect(keywordMatches('(🔥)', ['🔥'])).toBe(true);
    });
  });

  describe('Wildcard & Safety Hardening', () => {
    it('rejects *ANY* wildcard by default to prevent mass accidental sends', () => {
      expect(keywordMatches('anything at all', ['*ANY*'])).toBe(false);
      expect(keywordMatches('hello world', ['*any*'])).toBe(false);
    });

    it('allows *ANY* wildcard only when explicitly enabled', () => {
      expect(keywordMatches('anything at all', ['*ANY*'], { allowWildcard: true })).toBe(true);
      expect(keywordMatches('hello world', ['*any*'], { allowWildcard: true })).toBe(true);
    });

    it('rejects null or empty keyword array (never triggers)', () => {
      expect(keywordMatches('any message', null)).toBe(false);
      expect(keywordMatches('any message', [])).toBe(false);
      expect(keywordMatches('LINK', null)).toBe(false);
      expect(keywordMatches('LINK', [])).toBe(false);
    });

    it('handles whitespace-only keywords safely', () => {
      expect(keywordMatches('hello', ['   '])).toBe(false);
    });
  });

  describe('Exact Standalone Mode (Comment Triggers)', () => {
    it('matches exact standalone keyword with varying case and whitespace', () => {
      expect(keywordMatches('LINK', ['LINK'], { exactStandalone: true })).toBe(true);
      expect(keywordMatches('link', ['LINK'], { exactStandalone: true })).toBe(true);
      expect(keywordMatches('  link  ', ['LINK'], { exactStandalone: true })).toBe(true);
      expect(keywordMatches('Link', ['link'], { exactStandalone: true })).toBe(true);
    });

    it('matches standalone keyword with common outer punctuation or hashtags', () => {
      expect(keywordMatches('Link!', ['LINK'], { exactStandalone: true })).toBe(true);
      expect(keywordMatches('#LINK', ['LINK'], { exactStandalone: true })).toBe(true);
      expect(keywordMatches('#link!', ['LINK'], { exactStandalone: true })).toBe(true);
      expect(keywordMatches('"LINK"', ['LINK'], { exactStandalone: true })).toBe(true);
    });

    it('matches standalone emoji keywords', () => {
      expect(keywordMatches('🔥', ['🔥'], { exactStandalone: true })).toBe(true);
      expect(keywordMatches('  🔥  ', ['🔥'], { exactStandalone: true })).toBe(true);
    });

    it('rejects comments where keyword is part of a sentence or phrase', () => {
      expect(keywordMatches('send link', ['LINK'], { exactStandalone: true })).toBe(false);
      expect(keywordMatches('link please', ['LINK'], { exactStandalone: true })).toBe(false);
      expect(keywordMatches('where is the link?', ['LINK'], { exactStandalone: true })).toBe(false);
      expect(keywordMatches('can I get the link', ['LINK'], { exactStandalone: true })).toBe(false);
      expect(keywordMatches('Can I get the VIP discount?', ['vip'], { exactStandalone: true })).toBe(false);
    });
  });
});

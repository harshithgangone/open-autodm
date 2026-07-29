/**
 * Keyword matching rules (identical to the proven original):
 *  - null / empty keywords  → any text triggers (wildcard)
 *  - ["*ANY*"]              → explicit wildcard
 *  - otherwise              → case-insensitive whole-word match
 */

export function keywordMatches(text: string, keywords: string[] | null): boolean {
  if (!keywords || keywords.length === 0 || keywords.includes('*ANY*')) {
    return true;
  }

  const normalizedText = text.toLowerCase();

  return keywords.some((keyword) => {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (!normalizedKeyword) return false;
    const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(normalizedKeyword)}\\b`);
    return wordBoundaryRegex.test(normalizedText);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

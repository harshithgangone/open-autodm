/**
 * Keyword matching rules for open-autoDM:
 *
 * Hardened to prevent accidental mass-messaging:
 *  - null / empty keywords   → NEVER matches (returns false)
 *  - exactStandalone mode   → whole-comment match (e.g. "LINK", "Link!", "#link" matches "LINK", but "send link please" does not)
 *  - standard mode          → case-insensitive whole-word boundary match
 *  - *ANY* wildcard         → disabled by default; requires explicit allowWildcard: true
 */

export interface KeywordMatchOptions {
  /**
   * If true, requires the entire comment/message to consist solely of the keyword
   * (ignoring outer whitespace, punctuation, and casing).
   */
  exactStandalone?: boolean;

  /**
   * If true, allows the special '*ANY*' token to match all messages.
   * Default is false to prevent implicit wildcards.
   */
  allowWildcard?: boolean;

  /**
   * If true, treats null or empty keywords as matching all messages (wildcard mode).
   * Default is false to prevent accidental mass-messaging.
   */
  allowEmptyAsWildcard?: boolean;
}

/**
 * Normalizes a word for standalone comparison by stripping outer punctuation,
 * quotes, leading '#' or '@', and trailing emojis or exclamation marks.
 */
export function cleanStandaloneWord(str: string): string {
  if (!str) return '';
  const trimmed = str.trim().toLowerCase();
  const stripped = trimmed
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')
    .trim();
  // If stripping removed everything (e.g. the token is purely an emoji or symbol), preserve the trimmed string
  return stripped.length > 0 ? stripped : trimmed;
}

/**
 * Checks whether the text matches the specified keywords.
 */
export function keywordMatches(
  text: string,
  keywords: string[] | null,
  options: KeywordMatchOptions = {}
): boolean {
  const { exactStandalone = false, allowWildcard = false, allowEmptyAsWildcard = false } = options;

  if (!text) return false;

  if (allowEmptyAsWildcard && (!keywords || keywords.length === 0)) {
    return true;
  }

  if (!keywords || keywords.length === 0) {
    return false;
  }

  if (allowWildcard && keywords.some((kw) => kw.trim().toLowerCase() === '*any*')) {
    return true;
  }

  // ── Exact Standalone Match Mode (Recommended for Comment Funnels) ───────────
  if (exactStandalone) {
    const cleanText = cleanStandaloneWord(text);
    if (!cleanText) return false;

    return keywords.some((kw) => {
      const cleanKw = cleanStandaloneWord(kw);
      return cleanKw.length > 0 && cleanText === cleanKw;
    });
  }

  // ── Whole-Word Boundary Match Mode ──────────────────────────────────────────
  const normalizedText = text.toLowerCase();

  return keywords.some((keyword) => {
    const trimmed = keyword.toLowerCase().trim();
    if (!trimmed) return false;

    // Reject *ANY* if allowWildcard is false
    if (trimmed === '*any*' && !allowWildcard) return false;

    // Use Array.from to correctly handle multi-byte surrogate pairs (e.g. emojis)
    const chars = Array.from(trimmed);
    const firstChar = chars[0];
    const lastChar = chars[chars.length - 1];

    if (!firstChar || !lastChar) return false;

    const isFirstLetterOrNum = /[\p{L}\p{N}]/u.test(firstChar);
    const isLastLetterOrNum = /[\p{L}\p{N}]/u.test(lastChar);

    // Left boundary: if keyword starts with a letter/digit, don't match if preceded by another letter/digit.
    // If it starts with a symbol (like # or @ or emoji), don't match if preceded by letters/digits or identical symbol.
    const leftBoundary = isFirstLetterOrNum
      ? '(?<![\\p{L}\\p{N}])'
      : `(?<![\\p{L}\\p{N}${escapeRegex(firstChar)}])`;

    // Right boundary: if keyword ends with a letter/digit, don't match if followed by another letter/digit.
    // If it ends with a symbol, don't match if followed by letters/digits or identical symbol.
    const rightBoundary = isLastLetterOrNum
      ? '(?![\\p{L}\\p{N}])'
      : `(?![\\p{L}\\p{N}${escapeRegex(lastChar)}])`;

    const pattern = new RegExp(`${leftBoundary}${escapeRegex(trimmed)}${rightBoundary}`, 'u');
    return pattern.test(normalizedText);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Determines whether an automation has explicitly enabled wildcard mode
 * (matching any comment or message without specific keywords).
 * Requires explicit opt-in via:
 *  1. Array of keywords containing '*ANY*' or '__ANY__'
 *  2. trigger_config with trigger_mode === 'any' or keywords_any_mode === true
 *  3. flow_graph trigger node with keywordsAnyMode === true
 *
 * A null or empty keywords list alone DOES NOT enable wildcard mode.
 */
export function isExplicitWildcardAutomation(automation: {
  keywords?: string[] | null;
  trigger_config?: { trigger_mode?: string; keywords_any_mode?: boolean } | null;
  flow_graph?: { nodes?: Array<{ type: string; data?: { keywordsAnyMode?: boolean } }> } | null;
}): boolean {
  if (
    Array.isArray(automation.keywords) &&
    automation.keywords.some(
      (k) =>
        typeof k === 'string' &&
        (k.trim().toUpperCase() === '*ANY*' || k.trim().toUpperCase() === '__ANY__')
    )
  ) {
    return true;
  }

  if (automation.trigger_config) {
    if (
      automation.trigger_config.trigger_mode === 'any' ||
      automation.trigger_config.keywords_any_mode === true
    ) {
      return true;
    }
  }

  if (automation.flow_graph && Array.isArray(automation.flow_graph.nodes)) {
    const triggerNode = automation.flow_graph.nodes.find((n) => n.type === 'trigger');
    if (triggerNode?.data?.keywordsAnyMode === true) {
      return true;
    }
  }

  return false;
}

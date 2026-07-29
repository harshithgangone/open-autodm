/**
 * Message personalization — supports the `{username}` placeholder.
 *
 * Comment webhooks carry the commenter's username; DM/story-reply webhooks do
 * not. When no username is known the placeholder is stripped and surrounding
 * whitespace collapsed, so "Hey {username}!" degrades to "Hey!" not "Hey !".
 */

export function renderTemplate(text: string, username: string | null | undefined): string {
  if (!text.includes('{username}')) return text;
  if (username && username.trim()) {
    return text.replaceAll('{username}', `@${username.trim().replace(/^@/, '')}`);
  }
  return text
    .replaceAll('{username}', '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([!?.,])/g, '$1')
    .trim();
}

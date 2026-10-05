/** Restricts the self-hosted control panel to configured owners. Bot tokens are separate. */
export function isOwnerAllowed(email: string | undefined): boolean {
  const allowed = (process.env.APP_OWNER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return (
    allowed.length === 0 ||
    (email !== undefined && allowed.includes(email.toLowerCase()))
  );
}

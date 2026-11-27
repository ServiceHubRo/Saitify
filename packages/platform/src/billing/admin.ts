/**
 * Administrators are accounts whose VERIFIED email appears in ADMIN_EMAILS. No database flag, no client-supplied role: a
 * regular user cannot become an administrator by any request, and an unverified address never counts.
 */
export function isAdmin(user: { email: string; emailVerified: boolean } | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!user || !user.emailVerified) return false;
  const list = (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

/**
 * Resolve a post-login `redirect` parameter to a path that cannot leave the site.
 *
 * The parameter comes from the query string, so it is entirely attacker
 * controlled: anyone can send a user a link to /login?redirect=<anything>.
 * Guarding it with `startsWith('/')` is not enough, because several things a
 * browser treats as off-site also start with a slash:
 *
 *   //evil.com      protocol-relative — the browser goes to evil.com
 *   /\evil.com      backslash, which browsers normalise to a forward slash
 *   /\/evil.com     the same trick with a path after it
 *
 * The last two are the shape of GHSA-wrjc-x8rr-h8h6, where React Router's own
 * handling of a backslash in <Link> and useNavigate lets a redirect escape the
 * origin. Resolving against the real origin and insisting the result stays on
 * it closes all of them at once, and keeps doing so whatever the router does.
 */
export function safeRedirectPath(
  redirect: string | null | undefined,
  origin: string,
  fallback = '/',
): string {
  if (!redirect) return fallback;

  // A backslash never legitimately appears in a path this app generates, and
  // browsers fold it into a forward slash, so refuse it rather than reason
  // about where it lands.
  if (redirect.includes('\\')) return fallback;

  // Anything with a scheme, or protocol-relative, is off-site by construction.
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(redirect, origin);
  } catch {
    return fallback;
  }

  if (resolved.origin !== new URL(origin).origin) return fallback;

  // Rebuild from the parsed parts so only the path, query and fragment survive
  // — never credentials, host or scheme.
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

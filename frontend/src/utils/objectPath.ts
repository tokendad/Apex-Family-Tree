/**
 * Route for an archive object, given its type.
 *
 * Archive objects are linked to from many places — connections, claims,
 * collections, search — and each needs the same type-to-route mapping. It was
 * previously copied into several pages, and the copies had drifted: the version
 * in ClaimDetailPage omitted stories, so a connected story linked nowhere.
 *
 * Returns '#' for an unrecognised type rather than throwing, because the object
 * types come from the API and a new one should degrade to a dead link rather
 * than break the page rendering it.
 */
const ROUTES: Record<string, string> = {
  person: '/people',
  artifact: '/artifacts',
  event: '/events',
  place: '/places',
  collection: '/collections',
  claim: '/claims',
  story: '/stories',
  source: '/sources',
};

export function objectPath(type: string, id: string): string {
  const base = ROUTES[type];
  return base ? `${base}/${id}` : '#';
}

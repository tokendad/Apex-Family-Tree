import React, { useEffect, useState } from 'react';

/**
 * Shared machinery for the place typeahead (#35): one search path for the
 * event place field (PlaceInput) and for a place's parent (PlacePicker).
 *
 * It lives beside them rather than inside either, because a module that
 * exports both a component and a hook loses fast refresh.
 */

export interface PlaceSuggestion {
  id: string;
  title: string;
  place_type: string | null;
  address_text: string | null;
  locality: string | null;
  county: string | null;
  region: string | null;
  country: string | null;
  parent_place_id: string | null;
  parent_title: string | null;
}

/** Place types that can contain a street address. A locality can hold one; a
    street cannot hold another street. A place with no type recorded counts as
    a container, because most of the archive's localities have none and
    excluding them would leave the list empty. */
const CONTAINER_TYPES = new Set([
  'city', 'town', 'village', 'locality', 'township', 'borough',
  'county', 'state', 'province', 'region', 'country', 'parish',
]);

export function isContainer(suggestion: PlaceSuggestion): boolean {
  if (!suggestion.place_type) return true;
  return CONTAINER_TYPES.has(suggestion.place_type.toLowerCase());
}

/** What a suggestion reads as under its name: the place that contains it, or
    its own components when nothing does. */
export function suggestionHint(suggestion: PlaceSuggestion): string {
  const parts = suggestion.parent_title
    ? [suggestion.place_type, `in ${suggestion.parent_title}`]
    : [suggestion.place_type, suggestion.locality, suggestion.region, suggestion.country];
  return parts.filter(Boolean).join(' · ');
}

const DEBOUNCE_MS = 200;

/**
 * Debounced place suggestions for what somebody has typed so far.
 *
 * Asks GET /api/v1/places/suggest, which orders by how well the title matches
 * rather than by id the way the paged list does — ten rows ordered by id would
 * be an arbitrary ten of the matches.
 */
export function usePlaceSuggestions(
  term: string,
  options?: { containersOnly?: boolean },
): PlaceSuggestion[] {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const containersOnly = options?.containersOnly ?? false;

  useEffect(() => {
    if (!term.trim()) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/v1/places/suggest?q=${encodeURIComponent(term.trim())}`, {
        credentials: 'include',
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() as Promise<{ data?: PlaceSuggestion[] }> : { data: [] }))
        .then((json) => {
          const rows = json.data ?? [];
          setSuggestions(containersOnly ? rows.filter(isContainer) : rows);
        })
        .catch(() => setSuggestions([]));
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, containersOnly]);

  return suggestions;
}

/** Closes a dropdown when the next click lands outside it. */
export function useDismissOnOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [ref, isOpen, close]);
}

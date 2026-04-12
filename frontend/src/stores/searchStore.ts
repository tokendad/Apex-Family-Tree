import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SidebarContext = 'tree' | 'people' | 'families' | 'sources' | 'media';
export type DateMode = 'exact' | 'around5' | 'before' | 'after' | 'between' | 'unknown';

export interface SearchFilters {
  globalQuery: string;
  firstName: string;
  lastName: string;
  nameMatchType: 'contains' | 'startsWith' | 'exact' | 'soundex';
  initial: string;
  sex: '' | 'M' | 'F' | 'X' | 'U';
  dateMode: DateMode;
  dateYear: string;
  dateYearTo: string;
  dateApplyToBirth: boolean;
  dateApplyToDeath: boolean;
  dateApplyToMarriage: boolean;
  dateQualifier: '' | 'exact' | 'approximate' | 'before' | 'after';
  placeCountry: string;
  placeState: string;
  placeCity: string;
  hasPhoto: boolean;
  hasSources: boolean;
  hasMissingData: boolean;
  isLiving: '' | 'true' | 'false';
  relationshipType: '' | 'ancestor' | 'descendant' | 'sibling' | 'spouse';
}

interface SearchState extends SearchFilters {
  /** Total matching count returned by the last API call */
  totalCount: number | null;

  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  setFilters: (partial: Partial<SearchFilters>) => void;
  resetFilters: () => void;
  setTotalCount: (count: number | null) => void;
}

const defaultFilters: SearchFilters = {
  globalQuery: '',
  firstName: '',
  lastName: '',
  nameMatchType: 'contains',
  initial: '',
  sex: '',
  dateMode: 'exact',
  dateYear: '',
  dateYearTo: '',
  dateApplyToBirth: true,
  dateApplyToDeath: false,
  dateApplyToMarriage: false,
  dateQualifier: '',
  placeCountry: '',
  placeState: '',
  placeCity: '',
  hasPhoto: false,
  hasSources: false,
  hasMissingData: false,
  isLiving: '',
  relationshipType: '',
};

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      ...defaultFilters,
      totalCount: null,

      setFilter: (key, value) => set({ [key]: value, totalCount: null }),
      setFilters: (partial) => set({ ...partial, totalCount: null }),
      resetFilters: () => set({ ...defaultFilters, totalCount: null }),
      setTotalCount: (totalCount) => set({ totalCount }),
    }),
    {
      name: 'aft-search-filters',
      version: 1,
      migrate: (persisted: unknown) => {
        // v0 → v1: remove dead 'place' field
        const state = persisted as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { place: _p, ...rest } = state;
        return rest;
      },
      partialize: (state) => {
        // Only persist filter fields, not totalCount or actions
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { totalCount: _tc, setFilter: _sf, setFilters: _sfs, resetFilters: _rf, setTotalCount: _stc, ...filters } = state;
        return filters;
      },
    },
  ),
);

/** Person-specific filter keys (not relevant on non-person pages) */
const personFilterKeys: (keyof SearchFilters)[] = [
  'firstName', 'lastName', 'nameMatchType', 'initial', 'sex',
  'dateMode', 'dateYear', 'dateYearTo',
  'dateApplyToBirth', 'dateApplyToDeath', 'dateApplyToMarriage',
  'dateQualifier',
  'placeCountry', 'placeState', 'placeCity',
  'hasPhoto', 'hasSources', 'hasMissingData', 'isLiving',
  'relationshipType',
];

/** Whether a date query is effectively active (would produce API params) */
function isDateQueryActive(state: SearchFilters): boolean {
  if (state.dateMode === 'unknown') return true;
  return state.dateYear !== '';
}

/** Context-aware: returns true when any relevant filter is active for the given context */
export function hasActiveFilters(state: SearchFilters, context?: SidebarContext): boolean {
  if (state.globalQuery !== '') return true;
  const isPersonContext = !context || context === 'people' || context === 'tree';
  if (!isPersonContext) return false;
  const dateActive = isDateQueryActive(state);
  return personFilterKeys.some((key) => {
    if (key.startsWith('dateApplyTo') && !dateActive) return false;
    if (key === 'dateYearTo' && state.dateMode !== 'between') return false;
    const val = state[key];
    const def = defaultFilters[key];
    return val !== def;
  });
}

/** Count active filters (context-aware) */
export function activeFilterCount(state: SearchFilters, context?: SidebarContext): number {
  let count = 0;
  if (state.globalQuery !== '') count++;
  const isPersonContext = !context || context === 'people' || context === 'tree';
  if (isPersonContext) {
    const dateActive = isDateQueryActive(state);
    for (const key of personFilterKeys) {
      if (key.startsWith('dateApplyTo') && !dateActive) continue;
      if (key === 'dateYearTo' && state.dateMode !== 'between') continue;
      if (state[key] !== defaultFilters[key]) count++;
    }
  }
  return count;
}

/** Build URL search params from filters (for API calls) */
export function filtersToParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.globalQuery) params.set('q', filters.globalQuery);
  if (filters.firstName) params.set('firstName', filters.firstName);
  if (filters.lastName) params.set('lastName', filters.lastName);
  if (filters.nameMatchType !== 'contains') params.set('nameMatch', filters.nameMatchType);
  if (filters.initial) params.set('initial', filters.initial);
  if (filters.sex) params.set('sex', filters.sex);

  // Translate dateMode + dateYear + applyTo into backend year range params
  if (filters.dateYear && filters.dateMode !== 'unknown') {
    const year = parseInt(filters.dateYear, 10);
    if (!isNaN(year)) {
      let from: number | undefined;
      let to: number | undefined;

      switch (filters.dateMode) {
        case 'exact':
          from = year;
          to = year;
          break;
        case 'around5':
          from = year - 5;
          to = year + 5;
          break;
        case 'before':
          to = year;
          break;
        case 'after':
          from = year;
          break;
        case 'between': {
          from = year;
          const yearTo = parseInt(filters.dateYearTo, 10);
          if (!isNaN(yearTo)) to = yearTo;
          // Require both endpoints for between; skip if only one year provided
          if (from === undefined || to === undefined) {
            from = undefined;
            to = undefined;
          }
          break;
        }
      }

      if (filters.dateApplyToBirth) {
        if (from !== undefined) params.set('birthFrom', String(from));
        if (to !== undefined) params.set('birthTo', String(to));
      }
      if (filters.dateApplyToDeath) {
        if (from !== undefined) params.set('deathFrom', String(from));
        if (to !== undefined) params.set('deathTo', String(to));
      }
      if (filters.dateApplyToMarriage) {
        if (from !== undefined) params.set('marriageFrom', String(from));
        if (to !== undefined) params.set('marriageTo', String(to));
      }
    }
  }

  // "Unknown" date mode — find persons missing dates for the checked event types
  if (filters.dateMode === 'unknown') {
    if (filters.dateApplyToBirth) params.set('missingBirth', 'true');
    if (filters.dateApplyToDeath) params.set('missingDeath', 'true');
    if (filters.dateApplyToMarriage) params.set('missingMarriage', 'true');
  }

  if (filters.placeCountry) params.set('placeCountry', filters.placeCountry);
  if (filters.placeState) params.set('placeState', filters.placeState);
  if (filters.placeCity) params.set('placeCity', filters.placeCity);
  if (filters.dateQualifier) params.set('dateQualifier', filters.dateQualifier);
  if (filters.hasPhoto) params.set('hasPhoto', 'true');
  if (filters.hasSources) params.set('hasSources', 'true');
  if (filters.hasMissingData) params.set('hasMissingData', 'true');
  if (filters.isLiving) params.set('living', filters.isLiving);
  if (filters.relationshipType) params.set('relationship', filters.relationshipType);
  return params;
}

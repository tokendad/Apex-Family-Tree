import React from 'react';
import CollapsibleSection from '@/components/CollapsibleSection/CollapsibleSection';
import Input from '@/components/Form/Input';
import Select from '@/components/Form/Select';
import { useSearchStore, hasActiveFilters } from '@/stores/searchStore';
import type { DateMode } from '@/stores/searchStore';
import styles from './SearchSidebar.module.css';

interface SearchSidebarProps {
  /** Which page context we're on — controls which filters are visible */
  context?: 'tree' | 'people' | 'families' | 'sources' | 'media';
}

const SearchSidebar: React.FC<SearchSidebarProps> = ({ context = 'people' }) => {
  const store = useSearchStore();
  const isPersonContext = context === 'tree' || context === 'people';
  const active = hasActiveFilters(store, context);

  return (
    <div className={styles.searchSidebar}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Search tree</span>
        <span className={styles.persistentBadge} title="Filters are saved between visits">Saved</span>
      </div>

      <div className={styles.globalSearch}>
        <Input
          placeholder="Search name, place, date…"
          value={store.globalQuery}
          onChange={(e) => store.setFilter('globalQuery', e.target.value)}
          aria-label="Global search"
          className={styles.searchInput}
        />
      </div>

      {active && (
        <div className={styles.activeBar}>
          <span className={styles.activeLabel}>
            {store.totalCount !== null
              ? `${store.totalCount} match${store.totalCount !== 1 ? 'es' : ''}`
              : 'Searching\u2026'}
          </span>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => store.resetFilters()}
            aria-label="Clear all search filters"
          >
            Clear all
          </button>
        </div>
      )}

      {isPersonContext && (
        <>
          <CollapsibleSection title="Name" defaultOpen={true} className={styles.filterSection}>
            <fieldset className={styles.fieldGroup}>
              <legend className={styles.srOnly}>Name filters</legend>
              <div className={styles.nameRow}>
                <label className={styles.srOnly} htmlFor="aft-filter-first">First name</label>
                <Input
                  id="aft-filter-first"
                  placeholder="First name"
                  value={store.firstName}
                  onChange={(e) => store.setFilter('firstName', e.target.value)}
                />
                <label className={styles.srOnly} htmlFor="aft-filter-last">Last name</label>
                <Input
                  id="aft-filter-last"
                  placeholder="Last name"
                  value={store.lastName}
                  onChange={(e) => store.setFilter('lastName', e.target.value)}
                />
              </div>
              <div className={styles.matchRow}>
                <label className={styles.srOnly} htmlFor="aft-filter-match">Match type</label>
                <Select
                  id="aft-filter-match"
                  value={store.nameMatchType}
                  onChange={(e) =>
                    store.setFilter(
                      'nameMatchType',
                      e.target.value as 'contains' | 'startsWith' | 'exact' | 'soundex',
                    )
                  }
                >
                  <option value="contains">Any match</option>
                  <option value="startsWith">Starts with</option>
                  <option value="exact">Exact match</option>
                  <option value="soundex">Sounds like</option>
                </Select>
                <label className={styles.srOnly} htmlFor="aft-filter-initial">Middle initial</label>
                <Input
                  id="aft-filter-initial"
                  placeholder="Middle"
                  value={store.initial}
                  onChange={(e) => store.setFilter('initial', e.target.value)}
                  className={styles.initialInput}
                />
              </div>
              <label className={styles.srOnly} htmlFor="aft-filter-sex">Gender</label>
              <Select
                id="aft-filter-sex"
                value={store.sex}
                onChange={(e) =>
                  store.setFilter('sex', e.target.value as '' | 'M' | 'F' | 'X' | 'U')
                }
              >
                <option value="">Any gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="X">Other</option>
                <option value="U">Unknown</option>
              </Select>
            </fieldset>
          </CollapsibleSection>

          <CollapsibleSection title="Birth / Death Date" defaultOpen={false} className={styles.filterSection}>
            <div className={styles.fieldGroup}>
              <div className={styles.dateRow}>
                <label className={styles.srOnly} htmlFor="aft-filter-datemode">Date mode</label>
                <Select
                  id="aft-filter-datemode"
                  value={store.dateMode}
                  onChange={(e) => store.setFilter('dateMode', e.target.value as DateMode)}
                  className={styles.dateModeSelect}
                >
                  <option value="exact">Exact</option>
                  <option value="around5">Around ±5 yr</option>
                  <option value="before">Before</option>
                  <option value="after">After</option>
                  <option value="between">Between</option>
                  <option value="unknown">Unknown</option>
                </Select>
                {store.dateMode !== 'unknown' && store.dateMode !== 'between' && (
                  <>
                    <label className={styles.srOnly} htmlFor="aft-filter-year">Year</label>
                    <Input
                      id="aft-filter-year"
                      type="number"
                      placeholder="Year"
                      value={store.dateYear}
                      onChange={(e) => store.setFilter('dateYear', e.target.value)}
                      className={styles.yearInput}
                    />
                  </>
                )}
              </div>
              {store.dateMode === 'between' && (
                <div className={styles.dateRow}>
                  <label className={styles.srOnly} htmlFor="aft-filter-year-from">Year from</label>
                  <Input
                    id="aft-filter-year-from"
                    type="number"
                    placeholder="From"
                    value={store.dateYear}
                    onChange={(e) => store.setFilter('dateYear', e.target.value)}
                    className={styles.yearInput}
                  />
                  <span className={styles.rangeSep}>–</span>
                  <label className={styles.srOnly} htmlFor="aft-filter-yearto">Year to</label>
                  <Input
                    id="aft-filter-yearto"
                    type="number"
                    placeholder="To"
                    value={store.dateYearTo}
                    onChange={(e) => store.setFilter('dateYearTo', e.target.value)}
                    className={styles.yearInput}
                  />
                </div>
              )}
              <fieldset className={styles.dateCheckboxes}>
                <legend className={styles.srOnly}>Apply date filter to</legend>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={store.dateApplyToBirth}
                    onChange={(e) => store.setFilter('dateApplyToBirth', e.target.checked)}
                  />
                  Birth
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={store.dateApplyToDeath}
                    onChange={(e) => store.setFilter('dateApplyToDeath', e.target.checked)}
                  />
                  Death
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={store.dateApplyToMarriage}
                    onChange={(e) => store.setFilter('dateApplyToMarriage', e.target.checked)}
                  />
                  Marriage
                </label>
              </fieldset>
              <label className={styles.srOnly} htmlFor="aft-filter-dateq">Source precision</label>
              <Select
                id="aft-filter-dateq"
                value={store.dateQualifier}
                onChange={(e) =>
                  store.setFilter(
                    'dateQualifier',
                    e.target.value as '' | 'exact' | 'approximate' | 'before' | 'after',
                  )
                }
              >
                <option value="">Any precision</option>
                <option value="exact">Exact dates only</option>
                <option value="approximate">Approximate dates</option>
                <option value="before">Recorded as before</option>
                <option value="after">Recorded as after</option>
              </Select>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Place" defaultOpen={false} className={styles.filterSection}>
            <fieldset className={styles.fieldGroup}>
              <legend className={styles.srOnly}>Place filters</legend>
              <label className={styles.srOnly} htmlFor="aft-filter-country">Country of birth</label>
              <Input
                id="aft-filter-country"
                placeholder="Country of birth"
                value={store.placeCountry}
                onChange={(e) => store.setFilter('placeCountry', e.target.value)}
              />
              <label className={styles.srOnly} htmlFor="aft-filter-state">State / county</label>
              <Input
                id="aft-filter-state"
                placeholder="State / county"
                value={store.placeState}
                onChange={(e) => store.setFilter('placeState', e.target.value)}
              />
              <label className={styles.srOnly} htmlFor="aft-filter-city">City / town</label>
              <Input
                id="aft-filter-city"
                placeholder="City / town"
                value={store.placeCity}
                onChange={(e) => store.setFilter('placeCity', e.target.value)}
              />
            </fieldset>
          </CollapsibleSection>

          <CollapsibleSection title="Other Filters" defaultOpen={false} className={styles.filterSection}>
            <div className={styles.fieldGroup}>
              <label className={styles.srOnly} htmlFor="aft-filter-living">Living status</label>
              <Select
                id="aft-filter-living"
                value={store.isLiving}
                onChange={(e) =>
                  store.setFilter('isLiving', e.target.value as '' | 'true' | 'false')
                }
              >
                <option value="">Any status</option>
                <option value="true">Living</option>
                <option value="false">Deceased</option>
              </Select>
              <label className={styles.srOnly} htmlFor="aft-filter-relationship">Relationship type</label>
              <Select
                id="aft-filter-relationship"
                value={store.relationshipType}
                onChange={(e) =>
                  store.setFilter(
                    'relationshipType',
                    e.target.value as '' | 'ancestor' | 'descendant' | 'sibling' | 'spouse',
                  )
                }
              >
                <option value="">Any relation</option>
                <option value="ancestor">Direct ancestor</option>
                <option value="descendant">Descendant</option>
                <option value="sibling">Sibling</option>
                <option value="spouse">Spouse</option>
              </Select>
              <fieldset className={styles.otherCheckboxes}>
                <legend className={styles.srOnly}>Additional filters</legend>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={store.hasPhoto}
                    onChange={(e) => store.setFilter('hasPhoto', e.target.checked)}
                  />
                  Has photo
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={store.hasSources}
                    onChange={(e) => store.setFilter('hasSources', e.target.checked)}
                  />
                  Has sources
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={store.hasMissingData}
                    onChange={(e) => store.setFilter('hasMissingData', e.target.checked)}
                  />
                  Missing data
                </label>
              </fieldset>
            </div>
          </CollapsibleSection>
        </>
      )}

      {!isPersonContext && (
        <div className={styles.nonPersonHint}>
          Advanced person filters are available on the People and Tree pages.
        </div>
      )}
    </div>
  );
};

export default SearchSidebar;

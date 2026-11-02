import React from 'react';
import { suggestionHint, type PlaceSuggestion } from './placeSuggest';
import styles from './PlaceInput.module.css';

/** The dropdown shared by the place field and the parent picker (#35). */
const PlaceSuggestionList: React.FC<{
  id?: string;
  suggestions: PlaceSuggestion[];
  onChoose: (suggestion: PlaceSuggestion) => void;
  footer?: React.ReactNode;
}> = ({ id, suggestions, onChoose, footer }) => (
  <ul className={styles.list} id={id} role="listbox">
    {suggestions.map((suggestion) => (
      <li key={suggestion.id} role="option" aria-selected={false}>
        <button type="button" className={styles.option} onClick={() => onChoose(suggestion)}>
          <strong>{suggestion.title}</strong>
          {suggestionHint(suggestion) && <span>{suggestionHint(suggestion)}</span>}
        </button>
      </li>
    ))}
    {footer}
  </ul>
);

export default PlaceSuggestionList;

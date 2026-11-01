import React from 'react';
import { Link } from 'react-router-dom';
import { confidenceKey, confidenceLabel } from '@/utils/confidence';
import styles from './ConfidencePill.module.css';

/**
 * How settled a claim's conclusion is (#52).
 *
 * One component because the pill had started appearing in four places -- the
 * person page, the claims list, a claim's own page and the FAQ -- each with its
 * own copy of the markup and its own copy of the colour rules. The colours are
 * a contract: a reader who learns that yellow means Disputed has to find the
 * same thing everywhere, and four copies is four chances to drift.
 *
 * The fills live in tokens.css as --color-confidence-*. They are fills and not
 * text colours: at those saturations none of them is legible as text, but all
 * six clear WCAG AA under near-black ink. The level's name and number are
 * always inside the pill, so the signal never rests on colour alone -- which
 * matters because red and green both sit on this ramp.
 *
 * The vocabulary itself is in utils/confidence, so a page can reason about
 * confidence without drawing anything.
 */
interface ConfidencePillProps {
  name: string | null | undefined;
  score?: number | null;
  /** Renders as a link to the claim when given, and a plain span otherwise. */
  to?: string;
  /** Hover text, usually the claim's statement. */
  title?: string;
}

const ConfidencePill: React.FC<ConfidencePillProps> = ({ name, score, to, title }) => {
  const key = confidenceKey(name);
  const text = confidenceLabel(name, score);

  if (to) {
    return (
      <Link className={styles.pill} data-confidence={key} to={to} title={title}>
        {text}
      </Link>
    );
  }

  return (
    <span className={styles.pill} data-confidence={key} title={title}>
      {text}
    </span>
  );
};

export default ConfidencePill;

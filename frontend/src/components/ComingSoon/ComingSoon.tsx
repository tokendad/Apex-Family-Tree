import React from 'react';
import styles from './ComingSoon.module.css';

interface ComingSoonProps {
  /** What this page will eventually be. */
  title: string;
  /** One or two sentences on what the finished page will offer. */
  description: string;
  /** GitHub issue tracking the real implementation, if one exists. */
  issue?: number;
  /** Optional bullet list of what the finished page is expected to cover. */
  planned?: string[];
}

const REPO_URL = 'https://github.com/tokendad/Apex-Family-Tree';

/**
 * Placeholder panel for menu destinations that exist in navigation but are not
 * built yet. The username menu (#15) intentionally landed as a complete shape so
 * the structure can be reviewed before each sub-item is built, which means these
 * routes need to resolve to something honest rather than 404.
 *
 * When a real page replaces one of these, delete the corresponding page file's
 * use of this component — this panel is scaffolding, not a long-term pattern.
 */
const ComingSoon: React.FC<ComingSoonProps> = ({ title, description, issue, planned }) => {
  return (
    <section className={styles.wrapper} aria-labelledby="coming-soon-title">
      <div className={styles.header}>
        <h1 id="coming-soon-title" className={styles.title}>
          {title}
        </h1>
        <span className={styles.badge}>Planned</span>
      </div>

      <p className={styles.description}>{description}</p>

      {planned && planned.length > 0 && (
        <>
          <h2 className={styles.plannedTitle}>Expected to cover</h2>
          <ul className={styles.plannedList}>
            {planned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {issue !== undefined && (
        <p className={styles.issue}>
          Tracked in{' '}
          <a
            href={`${REPO_URL}/issues/${issue}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.issueLink}
          >
            issue #{issue}
          </a>
          .
        </p>
      )}
    </section>
  );
};

export default ComingSoon;

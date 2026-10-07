import React from 'react';
import styles from './ArchiveObjectLayout.module.css';

export interface ArchiveObjectStat {
  label: string;
  value: string | number;
}

export interface ArchiveObjectTab {
  id: string;
  label: string;
  count?: number;
}

export interface ConnectedGroup {
  id: string;
  label: string;
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    href?: string;
    initials?: string;
  }>;
}

interface ArchiveObjectLayoutProps {
  eyebrow?: string;
  /** Breadcrumb trail rendered above the title; replaces the eyebrow when present. */
  breadcrumb?: React.ReactNode;
  title: string;
  subtitle?: string;
  summary?: string | null;
  avatar?: React.ReactNode;
  headerAction?: React.ReactNode;
  stats?: ArchiveObjectStat[];
  tabs: ArchiveObjectTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: React.ReactNode;
}

const ArchiveObjectLayout: React.FC<ArchiveObjectLayoutProps> = ({
  eyebrow,
  breadcrumb,
  title,
  subtitle,
  summary,
  avatar,
  headerAction,
  stats = [],
  tabs,
  activeTab,
  onTabChange,
  children,
}) => {
  return (
    <section className={styles.shell}>
      <header className={styles.identity}>
        {avatar && <div className={styles.avatar}>{avatar}</div>}
        <div className={styles.identityText}>
          {breadcrumb ? (
            <div className={styles.crumb}>{breadcrumb}</div>
          ) : (
            eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>
          )}
          <h1>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {summary && <p className={styles.summary}>{summary}</p>}
        </div>
        {headerAction && <div className={styles.headerAction}>{headerAction}</div>}
      </header>

      {stats.length > 0 && (
        <div className={styles.stats} aria-label="Archive object counts">
          {stats.map((stat) => (
            <div key={stat.label} className={styles.stat}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.tabs} role="tablist" aria-label={`${title} sections`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
          </button>
        ))}
      </div>

      {/* The connected-objects panel was removed: it repeated the tabs and the
          stat row, truncated its lists, and below 980px it unstacked beneath the
          content inside an overflow:hidden shell, where it could not be reached
          at all. Counts live in the stat row, the objects themselves live in
          tabs. */}
      <div className={styles.mainPanel}>{children}</div>
    </section>
  );
};

export default ArchiveObjectLayout;

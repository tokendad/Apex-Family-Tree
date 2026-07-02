import React from 'react';
import { Link } from 'react-router-dom';
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
  connectedGroups: ConnectedGroup[];
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
  connectedGroups,
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

      <div className={styles.bodyGrid}>
        <div className={styles.mainPanel}>{children}</div>
        <aside className={styles.connectedPanel} aria-label="Connected archive objects">
          <div className={styles.connectedHeader}>Connected To</div>
          {connectedGroups.length === 0 ? (
            <p className={styles.empty}>No connected objects yet.</p>
          ) : connectedGroups.map((group) => (
            <section key={group.id} className={styles.connectedGroup}>
              <h2>{group.label}</h2>
              {group.items.length === 0 ? (
                <p className={styles.empty}>None recorded.</p>
              ) : group.items.map((item) => {
                const content = (
                  <>
                    <span className={styles.connectedAvatar}>{item.initials ?? item.title.slice(0, 1)}</span>
                    <span>
                      <strong>{item.title}</strong>
                      {item.subtitle && <small>{item.subtitle}</small>}
                    </span>
                  </>
                );

                return item.href ? (
                  <Link key={item.id} className={styles.connectedItem} to={item.href}>{content}</Link>
                ) : (
                  <div key={item.id} className={styles.connectedItem}>{content}</div>
                );
              })}
            </section>
          ))}
        </aside>
      </div>
    </section>
  );
};

export default ArchiveObjectLayout;

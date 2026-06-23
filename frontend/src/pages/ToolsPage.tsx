import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import styles from './ToolsPage.module.css';

interface ToolCard {
  title: string;
  description: string;
  status: 'available' | 'planned';
  href?: string;
}

const TOOL_CARDS: ToolCard[] = [
  {
    title: 'People Merge and De-Duplication',
    description: 'Find likely duplicate people, compare facts side by side, preview changes, and merge records safely.',
    status: 'available',
    href: '/tools/people-dedup',
  },
  {
    title: 'Families Cleanup',
    description: 'Planned duplicate-family review by shared spouses, children, and marriage facts.',
    status: 'planned',
  },
  {
    title: 'Sources Cleanup',
    description: 'Planned duplicate-source review by title, author, repository, and citation overlap.',
    status: 'planned',
  },
  {
    title: 'Media Cleanup',
    description: 'Planned unlinked media review, duplicate file review, and person-tag cleanup.',
    status: 'planned',
  },
  {
    title: 'Tree Integrity Checks',
    description: 'Planned checks for disconnected people, impossible dates, circular relationships, and missing core facts.',
    status: 'planned',
  },
  {
    title: 'Import/Export Utilities',
    description: 'Planned GEDCOM import and export helpers for reviewing bulk data operations.',
    status: 'planned',
  },
];

function ToolsSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Tools sections">
      <span className={styles.sidebarTitle}>Tools</span>
      <span className={styles.sidebarText}>Data cleanup workflows for maintaining your family tree.</span>
    </aside>
  );
}

function ToolCardContent({ tool }: { tool: ToolCard }) {
  return (
    <>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{tool.title}</h2>
        <span className={tool.status === 'available' ? styles.availableBadge : styles.plannedBadge}>
          {tool.status === 'available' ? 'Available' : 'Planned'}
        </span>
      </div>
      <p className={styles.cardDescription}>{tool.description}</p>
    </>
  );
}

export default function ToolsPage() {
  return (
    <AppShell navbar={<Navbar />} sidebar={<ToolsSidebar />}>
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Tools</h1>
          <p className={styles.subtitle}>
            Review, clean up, and maintain Apex Family Tree data from one place.
          </p>
        </div>

        <div className={styles.grid}>
          {TOOL_CARDS.map((tool) => {
            if (tool.status === 'available' && tool.href) {
              return (
                <Link key={tool.title} to={tool.href} className={`${styles.card} ${styles.activeCard}`}>
                  <ToolCardContent tool={tool} />
                </Link>
              );
            }

            return (
              <section key={tool.title} className={`${styles.card} ${styles.disabledCard}`} aria-disabled="true">
                <ToolCardContent tool={tool} />
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

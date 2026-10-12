import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import styles from './AboutPage.module.css';

interface InstanceInfo {
  instance_name: string;
  instance_timezone: string;
  gedcom_default_version: string;
}

/* The libraries this archive is built on. Named rather than generated from
   package.json: a dependency list is not a credit, and the point of this
   section is to say what other people's work is holding the thing up. */
const CREDITS = [
  'React',
  'Vite',
  'TypeScript',
  'Express',
  'SQLite (better-sqlite3)',
  'sharp',
  'argon2',
  'family-chart',
];

export default function AboutPage() {
  /* The instance's own name is an admin setting, so it is read rather than
     built in -- two households running this image should not both see the
     same name on this page. */
  const [instance, setInstance] = useState<InstanceInfo | null>(null);
  const [instanceFailed, setInstanceFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/instance', { credentials: 'include' });
        if (!res.ok) throw new Error('instance lookup failed');
        setInstance((await res.json()) as InstanceInfo);
      } catch {
        // The version, licence and source link are the substance of this page
        // and none of them need the server. A failed lookup costs the instance
        // row, not the page.
        setInstanceFailed(true);
      }
    })();
  }, []);

  const repository = __APP_REPOSITORY__;

  return (
    <AppShell navbar={<Navbar />}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>About</h1>
          <p className={styles.lede}>
            Apex Family Tree is a self-hosted family archive. It runs as a single container with
            its own database, on hardware you control, and it talks to no outside service.
          </p>
        </header>

        <section className={styles.section}>
          <h2>This instance</h2>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Name</dt>
              <dd>{instance?.instance_name ?? (instanceFailed ? 'Apex Family Tree' : '—')}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Version</dt>
              <dd className={styles.mono}>{__APP_VERSION__}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Time zone</dt>
              <dd>{instance?.instance_timezone ?? (instanceFailed ? 'UTC' : '—')}</dd>
            </div>
            <div className={styles.fact}>
              <dt>GEDCOM version</dt>
              <dd>
                {instance?.gedcom_default_version ?? (instanceFailed ? '5.5.1' : '—')}{' '}
                <span className={styles.unavailable}>used for new exports</span>
              </dd>
            </div>
          </dl>
          {instanceFailed && (
            <p className={styles.unavailable}>
              The instance settings could not be read just now; the defaults are shown.
            </p>
          )}
          <p className={styles.aside}>
            The name and time zone are set by an administrator under Admin → Settings.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Your data</h2>
          <p>
            Everything in this archive — people, events, photographs, documents, stories — lives in
            one SQLite database file on this machine, with uploaded files beside it. There is no
            account with anyone else, nothing is uploaded anywhere, and the archive keeps working
            whether or not the project does.
          </p>
          <p>
            It can be exported whole as GEDCOM at any time, which is the format other genealogy
            software reads. Leaving is a supported operation rather than an obstacle.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Licence</h2>
          <p>
            Released under the {__APP_LICENSE__ || 'MIT'} licence. You may run it, change it and
            pass it on; it comes with no warranty.
          </p>
          <p className={styles.licence}>
            Copyright © 2026 Apex Family Tree Contributors{'\n'}
            Permission is hereby granted, free of charge, to any person obtaining a copy of this
            software and associated documentation files, to deal in the Software without
            restriction, subject to the conditions in the LICENSE file.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Source</h2>
          {repository ? (
            <p>
              The source lives at{' '}
              <a
                className={styles.link}
                href={repository}
                target="_blank"
                rel="noopener noreferrer"
              >
                {repository.replace(/^https?:\/\//, '')}
              </a>
              . Issues and changes are welcome there.
            </p>
          ) : (
            <p className={styles.unavailable}>No repository is recorded for this build.</p>
          )}
        </section>

        <section className={styles.section}>
          <h2>Built with</h2>
          <p>
            Standing on a good deal of other people&rsquo;s work, under their own open licences:
          </p>
          <ul className={styles.credits}>
            {CREDITS.map((credit) => (
              <li key={credit} className={styles.credit}>
                {credit}
              </li>
            ))}
          </ul>
        </section>

        <footer className={styles.footer}>
          <p>
            Looking for something else? The <Link to="/faq">FAQ</Link> covers how to do things and
            the <Link to="/glossary">Glossary</Link> explains the words this archive uses.
          </p>
        </footer>
      </div>
    </AppShell>
  );
}

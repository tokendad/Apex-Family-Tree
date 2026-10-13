import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import styles from './FaqPage.module.css';

const SECTIONS = [
  { id: 'starting', label: 'Getting started' },
  { id: 'people', label: 'People & the tree' },
  { id: 'evidence', label: 'Artifacts, sources & claims' },
  { id: 'places', label: 'Places' },
  { id: 'gedcom', label: 'Import & export' },
  { id: 'access', label: 'Family & access' },
  { id: 'backups', label: 'Backups' },
];

/* Answers are drawn from the guides in Docs/Guides so the two cannot disagree,
   and each one was checked against the running code before being written here:
   the guides had drifted in two places -- invite codes were missing entirely
   and the backup naming and retention were wrong -- and those were corrected
   in the guides rather than repeated here. The Glossary explains what the
   concepts are; this page answers how to do things, and links there rather
   than explaining a concept twice. */
function Qa({ id, q, children }: { id: string; q: string; children: React.ReactNode }) {
  return (
    <details className={styles.qa} id={id}>
      <summary className={styles.question}>{q}</summary>
      <div className={styles.answer}>{children}</div>
    </details>
  );
}

export default function FaqPage() {
  return (
    <AppShell navbar={<Navbar />}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>FAQ</h1>
          <p className={styles.lede}>
            How to do things in this archive. For what the words mean — artifact, claim, evidence
            classification — see the <Link to="/glossary">Glossary</Link>.
          </p>
        </header>

        <nav className={styles.toc} aria-label="On this page">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className={styles.tocLink}>
              {section.label}
            </a>
          ))}
        </nav>

        <section id="starting" className={styles.section}>
          <h2>Getting started</h2>

          <Qa id="faq-first-steps" q="I have just set this up. What should I do first?">
            <p>
              Set a <strong>home person</strong> — usually yourself. The tree canvas draws outward
              from them, so it is the one setting that decides what you see when you open the app.
            </p>
            <p>
              Then either add people one at a time, or import a GEDCOM file if you already have a
              tree in other software. Importing first saves re-typing: the import brings people,
              families, events and sources with it.
            </p>
          </Qa>

          <Qa id="faq-home-person" q="What is the home person and can I change it?">
            <p>
              The person the tree is drawn around. It is per-user, so each member of the family can
              point the canvas at themselves without affecting anyone else.
            </p>
            <p>
              Change it from any person&rsquo;s page or from the canvas context menu.
            </p>
          </Qa>

          <Qa id="faq-add-person" q="How do I add a person?">
            <p>
              Use <strong>+ Add person</strong>, which walks through four steps: personal
              information, vital events (birth, death), relationships to people already in the
              tree, and finally media and notes.
            </p>
            <p>
              You can also use the dashed <code>+</code> placeholder cards on the canvas beside an
              existing person — those pre-fill the relationship, so adding a missing parent or
              child takes fewer decisions.
            </p>
          </Qa>
        </section>

        <section id="people" className={styles.section}>
          <h2>People &amp; the tree</h2>

          <Qa id="faq-date-formats" q="What date formats are accepted?">
            <p>
              A date field is free text and nothing is ever rejected — whatever you type is kept
              and shown back exactly as you typed it. What varies is how much of it the archive
              understands, which is what orders a person&rsquo;s timeline.
            </p>
            <p>Four shapes are read in full:</p>
            <table className={styles.formats}>
              <thead>
                <tr><th>You type</th><th>It reads as</th></tr>
              </thead>
              <tbody>
                <tr><td><code>1990-11-29</code></td><td>29 November 1990 — day, month and year</td></tr>
                <tr><td><code>29 NOV 1990</code></td><td>the same day, in GEDCOM&rsquo;s own form</td></tr>
                <tr><td><code>NOV 1990</code></td><td>November 1990 — no day</td></tr>
                <tr><td><code>1990</code></td><td>the year alone</td></tr>
              </tbody>
            </table>
            <p>
              Month names are the three-letter GEDCOM abbreviations, and capitals do not matter:
              <code>29 nov 1990</code> is read the same way. <code>YYYY-MM-DD</code> is what the
              fields suggest because it is the one numeric form that cannot be misread — whether
              <code>03-04-1990</code> means March or April depends on which side of the Atlantic
              wrote it.
            </p>
            <p>Any of those may carry a qualifier in front, for a date you do not know exactly:</p>
            <table className={styles.formats}>
              <tbody>
                <tr><td><code>ABT 1900</code></td><td>about — also <code>ABOUT</code></td></tr>
                <tr><td><code>BEF 1900</code></td><td>before — also <code>BEFORE</code></td></tr>
                <tr><td><code>AFT 1900</code></td><td>after — also <code>AFTER</code></td></tr>
                <tr><td><code>BET 1900 AND 1910</code></td><td>between; it sorts from the earlier date</td></tr>
                <tr><td><code>EST 1900</code></td><td>estimated — also <code>ESTIMATED</code></td></tr>
                <tr><td><code>CAL 1900</code></td><td>calculated from another date — also <code>CALCULATED</code></td></tr>
              </tbody>
            </table>
            <p>
              Anything else is kept verbatim but only partly understood, and the part it keeps is
              usually the year. <code>Nov 29 1990</code> is the common one: three parts are read
              as day, month, year, so <code>Nov</code> is not a day and <code>29</code> is not a
              month, and the event sorts to the start of 1990 — ahead of everything else that
              year, with the full date still on screen. If an event sits in the wrong place in a
              timeline, its date is the first thing to check.
            </p>
            <p>
              Dates are exported exactly as they are stored, so a form other software cannot read
              will not travel well either. A qualifier is the right way to say you are unsure —
              <code>ABT 1918</code> is honest and sorts sensibly, where <code>1918?</code> is
              neither.
            </p>
          </Qa>

          <Qa id="faq-privacy" q="Who can see a person I have marked private?">
            <p>
              Three levels. <strong>Public</strong> is visible to everyone with an account on this
              instance. <strong>Family only</strong> is visible to anyone logged in.{' '}
              <strong>Private</strong> is visible to admins and editors only — viewers do not see
              those people on the canvas at all.
            </p>
            <p>
              The level affects what the API returns, not just what the page draws, so it is a real
              restriction rather than a display preference.
            </p>
          </Qa>

          <Qa id="faq-step-family" q="How do I record a step-parent, or an adopted child?">
            <p>
              A family&rsquo;s children each carry a role: birth <strong>child</strong>, or{' '}
              <strong>adopted</strong>, <strong>foster</strong> or <strong>step</strong>. The role
              describes how the child joined the family, and it is shown on the name wherever it is
              anything other than a birth child.
            </p>
            <p>
              A step-parent is recorded by giving the parent a second family. They appear on a
              person&rsquo;s page below the parents rather than among them, because they are not an
              ancestor — and they appear whether or not they brought children of their own.
            </p>
          </Qa>

          <Qa id="faq-siblings" q="Why are my siblings split into three lists?">
            <p>
              Because a person can belong to more than one family.{' '}
              <strong>Siblings</strong> share both parents, <strong>half-siblings</strong> share
              one, and <strong>step-siblings</strong> share none — they are the children of a
              parent&rsquo;s spouse by someone else.
            </p>
            <p>
              Each entry says which parent the connection runs through. With both parents
              remarried, an unlabelled list of half-siblings cannot be read.
            </p>
          </Qa>

          <Qa id="faq-find-people" q="How do I find someone in a large tree?">
            <p>
              Search from the navbar. It is full-text across people, so part of a name is enough,
              and it does not depend on the person being visible on the current canvas view.
            </p>
          </Qa>
        </section>

        <section id="evidence" className={styles.section}>
          <h2>Artifacts, sources &amp; claims</h2>

          <Qa id="faq-artifact-vs-source" q="What is the difference between an artifact and a source?">
            <p>
              An <strong>artifact</strong> is a thing the family kept — a scan, a photograph, a
              letter, a certificate. A <strong>source</strong> is where information came from: a
              census, an obituary, a conversation. A <strong>citation</strong> is one specific
              thing that source told you, attached to the record it supports.
            </p>
            <p>
              One source usually carries many citations. A single death certificate might establish
              a date of death, a residence, an occupation and a parent&rsquo;s name — four
              citations, one source. The{' '}
              <Link to="/glossary#sources">Glossary</Link> has the full picture.
            </p>
          </Qa>

          <Qa id="faq-uncertain" q="How do I record something I am not sure about?">
            <p>
              As a <strong>claim</strong>, with a confidence level. Claims exist so the archive can
              hold something unsettled without either discarding it or presenting it as fact.
              Attach evidence to the claim and the evidence informs its confidence.
            </p>
            <p>
              This is the clearest departure from traditional genealogy software, which generally
              gives you one field for a date and no way to say &ldquo;probably, and here is
              why&rdquo;.
            </p>
          </Qa>

          <Qa id="faq-event-url" q="Where do I put a link to the record I found online?">
            <p>
              Events have a <strong>source URL</strong> field with a &ldquo;last checked&rdquo;
              date. Use that rather than pasting the link into the description — it survives into
              GEDCOM exports as a <code>WWW</code> tag, and the date is there because links rot.
            </p>
            <p>
              For anything more than a link — a citation you want to reuse across several records —
              create a source instead.
            </p>
          </Qa>
        </section>

        <section id="places" className={styles.section}>
          <h2>Places</h2>

          <Qa id="faq-place-record" q="I typed a place on an event. Is that a place record?">
            <p>
              Yes. Typing a location on an event creates a reusable <strong>place</strong> if that
              name is new, or links to the existing one if it is not, so every event at the same
              location points at one record rather than repeating the text. The{' '}
              <Link to="/places">Places</Link> page lists them, and each place shows the events
              that happened there.
            </p>
          </Qa>

          <Qa id="faq-place-spellings" q="Why do two spellings of the same town resolve to one place?">
            <p>
              Each place keeps the alternative spellings that have been recorded for it as{' '}
              <strong>aliases</strong>. Typing a spelling that matches an alias links to the
              existing place instead of creating a near-duplicate — so{' '}
              <code>Worcester, MA</code> and <code>Worcester, Worcester, Massachusetts</code> both
              land on <code>Worcester, Massachusetts</code>.
            </p>
            <p>
              A spelling nothing has recorded before becomes its own place. Nothing guesses that
              two unfamiliar names mean the same town, so near-duplicates are possible and there is
              not yet a way to merge two places — if you find a pair, the fix is to edit the events
              to use one spelling.
            </p>
          </Qa>
        </section>

        <section id="gedcom" className={styles.section}>
          <h2>Import &amp; export</h2>

          <Qa id="faq-gedcom-version" q="Which GEDCOM version should I choose?">
            <p>
              <strong>5.5.1</strong> unless you know the receiving software supports 7.0. Nearly
              all genealogy software reads and writes 5.5.1; 7.0 is the modern format with better
              Unicode and multimedia handling, and is offered for export.
            </p>
          </Qa>

          <Qa id="faq-export-scope" q="Can I export only part of the tree?">
            <p>
              Yes — the whole tree, the <strong>ancestors</strong> of one person, their{' '}
              <strong>descendants</strong> (optionally limited to a number of generations), or
              everyone with events in a <strong>date range</strong>.
            </p>
          </Qa>

          <Qa id="faq-export-media" q="Will my photographs come with the export?">
            <p>
              Your choice of three. A <strong>ZIP archive</strong> bundles the media beside the{' '}
              <code>.ged</code> file and is usually the right pick for sharing with family.{' '}
              <strong>Embedded</strong> encodes media into the GEDCOM itself, which produces one
              very large file. <strong>Links only</strong> includes references but no media, which
              keeps the file small.
            </p>
            <p>
              Exports are also kept in the instance&rsquo;s export directory, so you can fetch one
              again without regenerating it.
            </p>
          </Qa>

          <Qa id="faq-import-duplicates" q="What happens if I import a file that overlaps my tree?">
            <p>
              The import validates the file and shows you what it found before anything is written,
              then asks you to resolve conflicts where an incoming person looks like someone you
              already have.
            </p>
            <p>
              A full database snapshot is taken before the import begins, so an import that goes
              wrong can be undone.
            </p>
          </Qa>
        </section>

        <section id="access" className={styles.section}>
          <h2>Family &amp; access</h2>

          <Qa id="faq-invite" q="How do I give a family member access?">
            <p>
              Two ways, from <strong>User Management</strong>. An <strong>email invitation</strong>{' '}
              sends a one-time registration link to a named address and needs SMTP configured. An{' '}
              <strong>invite code</strong> needs no email server at all: it is eight characters like{' '}
              <code>K7M2-R9TX</code>, and you read it out, text it or write it down.
            </p>
            <p>
              If you have not set up email, use a code — that is what it is for. Codes default to
              one use and 24 hours, and can be set up to 50 uses and 30 days, so one code can
              onboard a whole branch of the family at a reunion. They can be revoked before use.
            </p>
          </Qa>

          <Qa id="faq-roles" q="What can each role do?">
            <p>
              <strong>Admin</strong> manages users, settings and the whole archive.{' '}
              <strong>Editor</strong> adds and changes records. <strong>Limited editor</strong>{' '}
              adds and changes but cannot delete. <strong>Viewer</strong> reads only, and does not
              see people marked private.
            </p>
            <p>
              There is no public sign-up page under any configuration — registration is invite-only.
            </p>
          </Qa>

          <Qa id="faq-no-email" q="I have no SMTP server. What stops working?">
            <p>
              Email invitations and password-reset emails. Everything else is unaffected: use invite
              codes to add people, and an admin can set a password directly for someone who is
              locked out.
            </p>
          </Qa>
        </section>

        <section id="backups" className={styles.section}>
          <h2>Backups</h2>

          <Qa id="faq-auto-backup" q="Does it back itself up?">
            <p>
              Partly, and it is worth knowing exactly how far. A full snapshot is taken{' '}
              <strong>every time the container starts</strong>, <strong>before any database
              migration</strong> during an update, and <strong>before a GEDCOM import</strong>.
              They land in <code>.data/backups/</code>.
            </p>
            <p>
              There is <strong>no scheduled or daily backup</strong>. If the container runs for
              weeks without a restart, no new automatic snapshot is taken in that time, so a
              regular copy of the data directory is still yours to arrange — the{' '}
              Backup &amp; Restore guide has a cron example.
            </p>
          </Qa>

          <Qa id="faq-backup-retention" q="How long are automatic backups kept?">
            <p>
              The last <strong>ten of each type</strong> — ten startup, ten pre-migration, ten
              pre-import — counted separately, so a run of restarts cannot evict the snapshot taken
              before a migration.
            </p>
            <p>
              Pre-migration snapshots are <strong>not</strong> kept forever; ten updates will age
              the oldest one out. If you want to keep a known-good copy from before a particular
              upgrade, move or rename it. Anything in the backup directory that AFT did not create
              is never touched and never counted.
            </p>
          </Qa>

          <Qa id="faq-what-backed-up" q="What is actually in a backup?">
            <p>
              The database: people, families, events, places, sources, claims, stories, users and
              settings. Uploaded photographs and documents live beside the database as files and are{' '}
              <strong>not</strong> inside these snapshots, so a complete backup means copying the
              whole data directory, not just the <code>.bak</code> file.
            </p>
          </Qa>
        </section>

        <footer className={styles.footer}>
          <p>
            Still stuck? The <Link to="/glossary">Glossary</Link> explains the concepts and{' '}
            <Link to="/about">About</Link> has the version and source for this instance.
          </p>
        </footer>
      </div>
    </AppShell>
  );
}

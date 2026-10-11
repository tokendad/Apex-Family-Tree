import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import styles from './GlossaryPage.module.css';

interface ArtifactType {
  id: string;
  name: string;
  description: string | null;
}

interface EvidenceClassification {
  id: string;
  name: string;
  description: string | null;
  default_weight: number | null;
}

interface ConfidenceLevel {
  id: string;
  name: string;
  description: string | null;
  numeric_value: number | null;
}

interface Vocabularies {
  artifactTypes: ArtifactType[];
  evidence: EvidenceClassification[];
  confidence: ConfidenceLevel[];
}

const SECTIONS = [
  { id: 'idea', label: 'The idea' },
  { id: 'people', label: 'People & relationships' },
  { id: 'events', label: 'Events' },
  { id: 'places', label: 'Places' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'type-vs-evidence', label: 'Type vs. evidence' },
  { id: 'evidence', label: 'Evidence classifications' },
  { id: 'claims', label: 'Claims & confidence' },
  { id: 'sources', label: 'Sources & citations' },
  { id: 'stories', label: 'Stories' },
  { id: 'collections', label: 'Collections' },
];

export default function GlossaryPage() {
  /* Read from the same endpoints the editors use rather than written out here.
     A hand-copied list goes stale silently: the issue that asked for this page
     listed twelve artifact types when there were already sixteen, and used one
     of the missing four in its own example. */
  const [vocab, setVocab] = useState<Vocabularies | null>(null);
  const [vocabFailed, setVocabFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [typesRes, evidenceRes, confidenceRes] = await Promise.all([
          fetch('/api/v1/artifacts/types', { credentials: 'include' }),
          fetch('/api/v1/artifacts/evidence-classifications', { credentials: 'include' }),
          fetch('/api/v1/claims/confidence-levels', { credentials: 'include' }),
        ]);
        if (!typesRes.ok || !evidenceRes.ok || !confidenceRes.ok) throw new Error('lookup failed');

        const [types, evidence, confidence] = await Promise.all([
          typesRes.json() as Promise<{ data: ArtifactType[] }>,
          evidenceRes.json() as Promise<{ data: EvidenceClassification[] }>,
          confidenceRes.json() as Promise<{ data: ConfidenceLevel[] }>,
        ]);

        setVocab({
          artifactTypes: types.data,
          evidence: evidence.data,
          confidence: confidence.data,
        });
      } catch {
        // The explanations are the point; the lists are illustration. A failed
        // lookup should cost the tables, not the page.
        setVocabFailed(true);
      }
    })();
  }, []);

  return (
    <AppShell navbar={<Navbar />}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Glossary</h1>
          <p className={styles.lede}>
            This archive borrows some words from genealogy software and uses several of its own.
            Here is what each one means, in plain language, and where it differs from what you
            may be used to.
          </p>
        </header>

        <nav className={styles.toc} aria-label="On this page">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className={styles.tocLink}>
              {section.label}
            </a>
          ))}
        </nav>

        <section id="idea" className={styles.section}>
          <h2>The idea</h2>
          <p>
            Most family tree software is built around one question: <em>who is related to whom</em>.
            People hang off a chart, and everything else — photographs, documents, stories — is an
            attachment to a person.
          </p>
          <p>
            This archive is built the other way round. A photograph, a place, an event and a story
            are each things in their own right, and they connect to each other as well as to people.
            The tree is one way of looking at the archive, not the archive itself.
          </p>
          <p className={styles.aside}>
            In practice that means a single photograph can belong to four people, one place, two
            events and a collection at the same time, without being copied four times.
          </p>
        </section>

        <section id="people" className={styles.section}>
          <h2>People, families and relationships</h2>
          <p>
            <strong>People</strong> are what you would expect. <strong>Families</strong> record a
            couple and their children, with marriage and divorce details.
          </p>
          <p>
            A family's children carry a role: a birth <strong>child</strong>, or{' '}
            <strong>adopted</strong>, <strong>foster</strong> or <strong>step</strong>. The role is
            about how the child joined the family, not about how much they belong to it, and it is
            shown on the name wherever it is anything other than a birth child.
          </p>
          <p>
            A <strong>step-parent</strong> is someone a parent married who is not the other parent.
            They are not an ancestor, so a person's page lists them below the parents rather than
            among them — and lists them whether or not they brought children of their own, since
            otherwise nothing on the page would show that a parent remarried.
          </p>
          <p>
            Because a person can belong to more than one family, siblings come in three kinds.{' '}
            <strong>Siblings</strong> share both parents. <strong>Half-siblings</strong> share one —
            they are a parent's own children by someone else, whether by birth or by adoption.{' '}
            <strong>Step-siblings</strong> share no parent at all: they are the children of a
            parent's spouse by someone else. A person's page lists the
            three separately and says which parent each connection runs through, since with both
            parents remarried an unlabelled list of half-siblings cannot be read.
          </p>
          <p>
            <strong>Relationships</strong> are the looser connections: who appears in a photograph,
            who told a story, which people a document is about. They are kept separately from
            family links because they are not about descent, and they can join anything to anything —
            a person to an artifact, an artifact to a place.
          </p>
        </section>

        <section id="events" className={styles.section}>
          <h2>Events</h2>
          <p>
            Something that happened. Births, deaths and marriages, but also graduations, military
            service, a census appearance, moving house, a reunion, a particular Christmas.
          </p>
          <p>
            Traditional software usually limits events to the formal genealogical set. Here an event
            is any moment worth recording, and it can be tied to people, places, artifacts and
            stories at once.
          </p>
        </section>

        <section id="places" className={styles.section}>
          <h2>Places</h2>
          <p>
            A location that matters — a house, a school, a church, a cemetery, a farm, a hospital.
            Places are recorded once and reused, so every event and photograph at the same address
            points at the same place rather than repeating the text.
          </p>
        </section>

        <section id="artifacts" className={styles.section}>
          <h2>Artifacts</h2>
          <p>
            Anything the family kept. A scan, a photograph, a letter, a recipe card, an audio
            recording, a certificate, a physical keepsake. Each one enters the archive as an
            artifact with its own record, rather than as a file attached to somebody.
          </p>
          <p>
            Every artifact has exactly one <strong>type</strong>, which answers{' '}
            <em>what is this?</em>
          </p>

          {vocabFailed && (
            <p className={styles.unavailable}>
              The list of types could not be loaded just now. You can see them on any artifact page.
            </p>
          )}

          {vocab && (
            <dl className={styles.terms}>
              {vocab.artifactTypes.map((type) => (
                <div key={type.id} className={styles.term}>
                  <dt>{type.name}</dt>
                  <dd>{type.description ?? '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section id="type-vs-evidence" className={styles.section}>
          <h2>Type vs. evidence classification</h2>
          <p>
            This is the distinction most worth getting straight, and the easiest to get wrong.
          </p>
          <blockquote className={styles.quote}>
            An artifact is defined by <strong>what it is</strong>, not by{' '}
            <strong>how it is used</strong>.
          </blockquote>
          <p>
            Grandpa&rsquo;s WWII draft notice is a <strong>Military Document</strong>. That is its
            type and it never changes. It also carries the authority of an{' '}
            <strong>Official Record</strong>. That is its evidence classification, and it describes
            how much weight the document lends to a claim.
          </p>
          <p>
            Two separate questions: <em>what is this?</em> and <em>how much does it prove?</em>
            Neither answer replaces the other, and an artifact can sit in the archive for years
            with the first answered and the second blank.
          </p>
        </section>

        <section id="evidence" className={styles.section}>
          <h2>Evidence classifications</h2>
          <p>
            How much authority a piece of evidence carries. A death certificate and a cousin&rsquo;s
            recollection may say the same thing; they do not carry the same weight, and the archive
            records the difference rather than flattening it.
          </p>
          <p className={styles.aside}>
            The weight is a number out of 100, used to rank evidence rather than to decide anything
            on its own.
          </p>

          {vocab && (
            <dl className={styles.terms}>
              {vocab.evidence.map((classification) => (
                <div key={classification.id} className={styles.term}>
                  <dt>
                    {classification.name}
                    {classification.default_weight !== null && (
                      <span className={styles.weight}>{classification.default_weight}</span>
                    )}
                  </dt>
                  <dd>{classification.description ?? '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section id="claims" className={styles.section}>
          <h2>Claims and confidence</h2>
          <p>
            A <strong>claim</strong> is a statement about family history that may or may not be
            settled. <em>John served in the Second World War. This photograph was taken at 12 Maple
            Street. Sarah is the daughter of James and Anna.</em>
          </p>
          <p>
            Claims exist so the archive can hold something that is not yet certain without either
            discarding it or presenting it as fact. Evidence is attached to a claim, and the
            evidence informs its <strong>confidence</strong>.
          </p>
          <p className={styles.aside}>
            This is the clearest departure from traditional software, which generally offers one
            field for a date and no way to say &ldquo;probably, and here is why&rdquo;.
          </p>

          {vocab && (
            <dl className={styles.terms}>
              {vocab.confidence.map((level) => (
                <div key={level.id} className={styles.term}>
                  <dt>
                    {level.name}
                    {level.numeric_value !== null && (
                      <span className={styles.weight}>{level.numeric_value}</span>
                    )}
                  </dt>
                  <dd>{level.description ?? '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section id="sources" className={styles.section}>
          <h2>Sources and citations</h2>
          <p>
            A <strong>source</strong> is where information came from: a census, an obituary, a
            probate docket, a family research worksheet, a conversation. A{' '}
            <strong>citation</strong> is one specific thing that source told you, attached to the
            record it supports.
          </p>
          <p>
            One source usually carries many citations. A single death certificate might establish a
            date of death, a residence, an occupation and a parent&rsquo;s name — four citations,
            one source.
          </p>
        </section>

        <section id="stories" className={styles.section}>
          <h2>Stories</h2>
          <p>
            Narrative. What a person was like, why a photograph matters, what happened the year
            everyone remembers. Stories hold the meaning that dates and places cannot, and they can
            be attached to a person, a place, an event, an artifact or a collection.
          </p>
        </section>

        <section id="collections" className={styles.section}>
          <h2>Collections</h2>
          <p>
            A curated group of anything in the archive — <em>Mom&rsquo;s School Records</em>,{' '}
            <em>Christmas Through the Years</em>, <em>Grandpa&rsquo;s Military Service</em>.
          </p>
          <p>
            Collections are not folders. Nothing moves into one and nothing is removed from
            anywhere else; a record can sit in several collections at once while staying exactly
            where it was.
          </p>
        </section>

        <footer className={styles.footer}>
          <p>
            Still unclear on something? The{' '}
            <Link to="/faq">FAQ</Link> and <Link to="/about">About</Link> pages cover the rest.
          </p>
        </footer>
      </div>
    </AppShell>
  );
}

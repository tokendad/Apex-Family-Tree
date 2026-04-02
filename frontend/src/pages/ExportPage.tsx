import React, { useState, useEffect } from 'react';
import styles from './ExportPage.module.css';

type GedcomVersion = '5.5.1' | '7.0';
type Scope = 'full' | 'ancestors' | 'descendants' | 'date_range';
type MediaOption = 'links' | 'zip';

interface PersonResult {
  id: string;
  names: { given_name: string | null; surname: string | null; is_primary: number }[];
  primary_name?: { given_name: string | null; surname: string | null };
}

interface ExportJob {
  id: string;
  status: string;
  total_records: number;
  file_path: string | null;
  error_message: string | null;
}

const ExportPage: React.FC = () => {
  const [gedcomVersion, setGedcomVersion] = useState<GedcomVersion>('5.5.1');
  const [scope, setScope] = useState<Scope>('full');
  const [mediaOption, setMediaOption] = useState<MediaOption>('links');
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [personSearch, setPersonSearch] = useState('');
  const [personResults, setPersonResults] = useState<PersonResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [job, setJob] = useState<ExportJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Person search
  useEffect(() => {
    if (personSearch.length < 2) {
      setPersonResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/people?q=${encodeURIComponent(personSearch)}&limit=10`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setPersonResults(data.data || []);
          setShowResults(true);
        }
      } catch {
        // Silently ignore search errors
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [personSearch]);

  const formatPersonName = (p: PersonResult): string => {
    const name = p.primary_name || p.names?.[0];
    if (!name) return 'Unknown';
    return [name.given_name, name.surname].filter(Boolean).join(' ') || 'Unknown';
  };

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setJob(null);

    try {
      const body: Record<string, string> = {
        gedcom_version: gedcomVersion,
        scope,
        media_option: mediaOption,
      };

      if ((scope === 'ancestors' || scope === 'descendants') && selectedPerson) {
        body.scope_person_id = selectedPerson.id;
      }
      if (scope === 'date_range') {
        if (startDate) body.scope_start_date = startDate;
        if (endDate) body.scope_end_date = endDate;
      }

      const res = await fetch('/api/v1/gedcom/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Export failed');
      }

      const data = await res.json();
      setJob(data.job);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const needsPerson = scope === 'ancestors' || scope === 'descendants';
  const canExport = !loading &&
    (scope === 'full' ||
      (needsPerson && selectedPerson) ||
      scope === 'date_range');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>GEDCOM Export</h1>

      {error && <div className={styles.error}>{error}</div>}

      {!job ? (
        <>
          {/* Format */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Format</div>
            <div className={styles.radioGroup}>
              {(['5.5.1', '7.0'] as GedcomVersion[]).map(v => (
                <label
                  key={v}
                  className={`${styles.radioLabel} ${gedcomVersion === v ? styles.radioLabelSelected : ''}`}
                >
                  <input
                    type="radio"
                    name="version"
                    checked={gedcomVersion === v}
                    onChange={() => setGedcomVersion(v)}
                  />
                  GEDCOM {v}
                  {v === '7.0' && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>(newer)</span>}
                </label>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Scope</div>
            <div className={styles.radioGroup}>
              <label className={`${styles.radioLabel} ${scope === 'full' ? styles.radioLabelSelected : ''}`}>
                <input type="radio" name="scope" checked={scope === 'full'} onChange={() => setScope('full')} />
                Full Tree
              </label>
              <label className={`${styles.radioLabel} ${scope === 'ancestors' ? styles.radioLabelSelected : ''}`}>
                <input type="radio" name="scope" checked={scope === 'ancestors'} onChange={() => setScope('ancestors')} />
                Ancestors of…
              </label>
              <label className={`${styles.radioLabel} ${scope === 'descendants' ? styles.radioLabelSelected : ''}`}>
                <input type="radio" name="scope" checked={scope === 'descendants'} onChange={() => setScope('descendants')} />
                Descendants of…
              </label>
              <label className={`${styles.radioLabel} ${scope === 'date_range' ? styles.radioLabelSelected : ''}`}>
                <input type="radio" name="scope" checked={scope === 'date_range'} onChange={() => setScope('date_range')} />
                Date Range
              </label>
            </div>

            {/* Person picker */}
            {needsPerson && (
              <div className={styles.conditionalField}>
                <label className={styles.fieldLabel}>Select a person</label>
                <div className={styles.personPicker}>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Search by name…"
                    value={personSearch}
                    onChange={e => setPersonSearch(e.target.value)}
                    onFocus={() => personResults.length > 0 && setShowResults(true)}
                    onBlur={() => setTimeout(() => setShowResults(false), 200)}
                  />
                  {showResults && personResults.length > 0 && (
                    <div className={styles.personResults}>
                      {personResults.map(p => (
                        <div
                          key={p.id}
                          className={styles.personResult}
                          onMouseDown={() => {
                            setSelectedPerson(p);
                            setPersonSearch('');
                            setShowResults(false);
                          }}
                        >
                          {formatPersonName(p)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedPerson && (
                  <div className={styles.selectedPerson}>
                    {formatPersonName(selectedPerson)}
                    <button
                      className={styles.clearPerson}
                      onClick={() => setSelectedPerson(null)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Date range */}
            {scope === 'date_range' && (
              <div className={styles.conditionalField}>
                <div className={styles.dateRange}>
                  <div>
                    <label className={styles.fieldLabel}>Start Date</label>
                    <input
                      className={styles.input}
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={styles.fieldLabel}>End Date</label>
                    <input
                      className={styles.input}
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Media */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Media</div>
            <div className={styles.radioGroup}>
              <label className={`${styles.radioLabel} ${mediaOption === 'links' ? styles.radioLabelSelected : ''}`}>
                <input type="radio" name="media" checked={mediaOption === 'links'} onChange={() => setMediaOption('links')} />
                Include links only
              </label>
              <label className={`${styles.radioLabel} ${mediaOption === 'zip' ? styles.radioLabelSelected : ''}`}>
                <input type="radio" name="media" checked={mediaOption === 'zip'} onChange={() => setMediaOption('zip')} />
                Exclude media
              </label>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!canExport}
              onClick={handleExport}
            >
              {loading ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Result */}
          {job.status === 'completed' ? (
            <div style={{ textAlign: 'center' }}>
              <div className={styles.completionIcon}>✅</div>
              <div className={styles.completionTitle}>Export Complete!</div>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
                {job.total_records} records exported as GEDCOM {gedcomVersion}
              </p>
              <a
                href={`/api/v1/gedcom/export/${job.id}/download`}
                className={styles.downloadLink}
              >
                📥 Download GEDCOM File
              </a>
              <div className={styles.actions}>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => { setJob(null); setError(null); }}
                >
                  Export Another
                </button>
              </div>
            </div>
          ) : job.status === 'failed' ? (
            <div style={{ textAlign: 'center' }}>
              <div className={styles.completionIcon}>❌</div>
              <div className={styles.completionTitle}>Export Failed</div>
              {job.error_message && <div className={styles.error}>{job.error_message}</div>}
              <div className={styles.actions}>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => { setJob(null); setError(null); }}
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: '100%' }} />
              </div>
              <div className={styles.progressLabel}>Generating export…</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ExportPage;

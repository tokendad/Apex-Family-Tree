import React, { useState, useCallback, useRef } from 'react';
import styles from './ImportPage.module.css';
import type { MergeAnalysis, ReviewState } from '@/pages/import/mergeReview';
import { initReviewState, setDecision, setField, unresolvedCount, toApiDecisions } from '@/pages/import/mergeReview';
import MergeReviewScreen from '@/components/MergeReview/MergeReviewScreen';

interface ImportStats {
  persons: number;
  families: number;
  sources: number;
  repositories: number;
  events: number;
  conflicts: number;
  warnings: string[];
}

interface Conflict {
  id: string;
  xref: string;
  record_type: string;
  field_name: string;
  existing_value: string | null;
  incoming_value: string | null;
  resolution: 'skip' | 'overwrite' | 'merge' | null;
}

interface ImportJob {
  id: string;
  status: string;
  filename: string;
  file_size: number;
  total_records: number;
  processed_records: number;
  gedcom_version: string | null;
  error_message: string | null;
}

type ImportMode = 'new' | 'merge';

type Step = 'upload' | 'validation' | 'conflicts' | 'review' | 'progress';

const NEW_STEPS: Step[] = ['upload', 'validation', 'conflicts', 'progress'];
const MERGE_STEPS: Step[] = ['upload', 'review', 'progress'];

const NEW_STEP_LABELS: Record<Step, string> = {
  upload: '1. Upload',
  validation: '2. Validation',
  conflicts: '3. Conflicts',
  review: '3. Review',
  progress: '4. Import',
};

const MERGE_STEP_LABELS: Record<Step, string> = {
  upload: '1. Upload',
  validation: '2. Validation',
  conflicts: '3. Conflicts',
  review: '2. Review',
  progress: '3. Import',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ImportPage: React.FC = () => {
  const [mode, setMode] = useState<ImportMode>('new');
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Merge-mode state
  const [analysis, setAnalysis] = useState<MergeAnalysis | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>({});
  const [selectedXref, setSelectedXref] = useState<string>('');

  const STEPS = mode === 'merge' ? MERGE_STEPS : NEW_STEPS;
  const STEP_LABELS = mode === 'merge' ? MERGE_STEP_LABELS : NEW_STEP_LABELS;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);

      const res = await fetch('/api/v1/gedcom/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      setJob(data.job);

      if (mode === 'merge') {
        // Merge mode: read merge analysis and go to review step
        const mergeAnalysis: MergeAnalysis = data.mergeAnalysis;
        setAnalysis(mergeAnalysis);
        const initState = initReviewState(mergeAnalysis);
        setReviewState(initState);
        const firstXref = mergeAnalysis.persons[0]?.xref ?? '';
        setSelectedXref(firstXref);
        setStep('review');
      } else {
        // New-tree mode: existing validation flow
        setStats(data.validation.stats);
        setVersion(data.validation.version);
        setEncoding(data.validation.encoding);

        if (data.validation.conflictCount > 0) {
          const conflictsRes = await fetch(`/api/v1/gedcom/import/${data.job.id}/conflicts`, {
            credentials: 'include',
          });
          const conflictsData = await conflictsRes.json();
          setConflicts(conflictsData.conflicts || []);
        }

        setStep('validation');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleProceedFromValidation = () => {
    if (conflicts.length > 0) {
      setStep('conflicts');
    } else {
      handleProcess();
    }
  };

  const handleResolveConflict = (conflictId: string, resolution: 'skip' | 'overwrite' | 'merge') => {
    setConflicts(prev =>
      prev.map(c => (c.id === conflictId ? { ...c, resolution } : c))
    );
  };

  const handleResolveAll = (resolution: 'skip' | 'overwrite' | 'merge') => {
    setConflicts(prev => prev.map(c => ({ ...c, resolution })));
  };

  const handleProcess = async () => {
    if (!job) return;
    setLoading(true);
    setError(null);
    setStep('progress');

    try {
      // Submit conflict resolutions if any (new-tree mode)
      const resolvedConflicts = conflicts.filter(c => c.resolution);
      if (resolvedConflicts.length > 0) {
        await fetch(`/api/v1/gedcom/import/${job.id}/conflicts`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resolutions: resolvedConflicts.map(c => ({
              id: c.id,
              resolution: c.resolution,
            })),
          }),
        });
      }

      // Start processing
      const res = await fetch(`/api/v1/gedcom/import/${job.id}/process`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Processing failed');
      }

      const data = await res.json();
      setJob(data.job);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMergeConfirm = async () => {
    if (!job || !analysis) return;
    setLoading(true);
    setError(null);

    try {
      // Post decisions
      await fetch(`/api/v1/gedcom/import/${job.id}/decisions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: toApiDecisions(analysis, reviewState) }),
      });

      // Then process with mode
      setStep('progress');
      const res = await fetch(`/api/v1/gedcom/import/${job.id}/process`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Processing failed');
      }

      const data = await res.json();
      setJob(data.job);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const allConflictsResolved = conflicts.every(c => c.resolution !== null);
  const mergeUnresolved = analysis ? unresolvedCount(analysis, reviewState) : 0;

  const resetAll = () => {
    setStep('upload');
    setFile(null);
    setJob(null);
    setStats(null);
    setConflicts([]);
    setError(null);
    setAnalysis(null);
    setReviewState({});
    setSelectedXref('');
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>GEDCOM Import</h1>

      {/* Step indicator */}
      <div className={styles.steps}>
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`${styles.step} ${i === stepIndex ? styles.stepActive : ''} ${i < stepIndex ? styles.stepDone : ''}`}
          >
            {STEP_LABELS[s]}
          </div>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <>
          {/* Mode toggle */}
          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'new' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('new')}
            >
              Import as new tree
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'merge' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('merge')}
            >
              Merge with existing tree
            </button>
          </div>

          <div
            className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={styles.dropzoneIcon}>📂</div>
            <div className={styles.dropzoneLabel}>
              Drop your GEDCOM file here, or click to browse
            </div>
            <div className={styles.dropzoneHint}>
              Accepts .ged and .gedcom files up to 50 MB
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ged,.gedcom"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </div>

          {file && (
            <div className={styles.fileInfo}>
              <strong>{file.name}</strong> — {formatBytes(file.size)}
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!file || loading}
              onClick={handleUpload}
            >
              {loading ? 'Uploading…' : 'Upload & Validate'}
            </button>
          </div>
        </>
      )}

      {/* Step 2 (new mode): Validation */}
      {step === 'validation' && stats && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.persons}</div>
              <div className={styles.statLabel}>Individuals</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.families}</div>
              <div className={styles.statLabel}>Families</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.sources}</div>
              <div className={styles.statLabel}>Sources</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.events}</div>
              <div className={styles.statLabel}>Events</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.conflicts}</div>
              <div className={styles.statLabel}>Conflicts</div>
            </div>
          </div>

          {version && (
            <div className={styles.fileInfo}>
              GEDCOM version: <strong>{version}</strong>
              {encoding && <> · Encoding: <strong>{encoding}</strong></>}
            </div>
          )}

          {stats.warnings.length > 0 && (
            <div className={styles.warnings}>
              <div className={styles.warningTitle}>⚠ Warnings ({stats.warnings.length})</div>
              <ul className={styles.warningList}>
                {stats.warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {stats.warnings.length > 20 && (
                  <li>…and {stats.warnings.length - 20} more</li>
                )}
              </ul>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => {
                setStep('upload');
                setFile(null);
                setJob(null);
                setStats(null);
                setConflicts([]);
              }}
            >
              Start Over
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleProceedFromValidation}
              disabled={loading}
            >
              {conflicts.length > 0 ? 'Review Conflicts' : 'Start Import'}
            </button>
          </div>
        </>
      )}

      {/* Step 3 (new mode): Conflicts */}
      {step === 'conflicts' && (
        <>
          <p style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
            {conflicts.length} record(s) already exist in your tree. Choose how to handle each conflict.
          </p>

          <div style={{ marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
            <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnSecondary}`} onClick={() => handleResolveAll('skip')}>
              Skip All
            </button>
            <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnSecondary}`} onClick={() => handleResolveAll('overwrite')}>
              Overwrite All
            </button>
          </div>

          <table className={styles.conflictTable}>
            <thead>
              <tr>
                <th>XREF</th>
                <th>Type</th>
                <th>Incoming</th>
                <th>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map(c => (
                <tr key={c.id}>
                  <td>{c.xref}</td>
                  <td>{c.record_type}</td>
                  <td>{c.incoming_value}</td>
                  <td>
                    <div className={styles.conflictActions}>
                      {(['skip', 'overwrite', 'merge'] as const).map(r => (
                        <button
                          key={r}
                          className={`${styles.btn} ${styles.btnSmall} ${c.resolution === r ? styles.btnPrimary : styles.btnSecondary}`}
                          onClick={() => handleResolveConflict(c.id, r)}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.actions}>
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setStep('validation')}
            >
              Back
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!allConflictsResolved || loading}
              onClick={handleProcess}
            >
              {loading ? 'Processing…' : 'Start Import'}
            </button>
          </div>
        </>
      )}

      {/* Review step (merge mode only) */}
      {step === 'review' && analysis && (
        <>
          <MergeReviewScreen
            analysis={analysis}
            state={reviewState}
            selectedXref={selectedXref}
            onSelect={setSelectedXref}
            onDecision={(xref, kind, candidateId) =>
              setReviewState((s) => setDecision(s, xref, kind, candidateId))
            }
            onField={(xref, field, choice) =>
              setReviewState((s) => setField(s, xref, field, choice))
            }
          />
          <div className={styles.actions}>
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={resetAll}
            >
              Start Over
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={mergeUnresolved > 0 || loading}
              onClick={handleMergeConfirm}
            >
              {loading
                ? 'Processing…'
                : mergeUnresolved > 0
                ? `${mergeUnresolved} decision${mergeUnresolved !== 1 ? 's' : ''} remaining`
                : 'Confirm & Import'}
            </button>
          </div>
        </>
      )}

      {/* Progress / Completion */}
      {step === 'progress' && (
        <>
          {loading ? (
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: '100%' }} />
              </div>
              <div className={styles.progressLabel}>Importing records…</div>
            </div>
          ) : job?.status === 'completed' ? (
            <>
              <div className={styles.completionIcon}>✅</div>
              <div className={styles.completionTitle}>Import Complete!</div>
              {stats && (
                <div className={styles.statsGrid}>
                  <div className={styles.statCard}>
                    <div className={styles.statValue}>{stats.persons}</div>
                    <div className={styles.statLabel}>Persons</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statValue}>{stats.families}</div>
                    <div className={styles.statLabel}>Families</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statValue}>{stats.events}</div>
                    <div className={styles.statLabel}>Events</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statValue}>{stats.sources}</div>
                    <div className={styles.statLabel}>Sources</div>
                  </div>
                </div>
              )}
              <div className={styles.actions}>
                <a href="/" className={`${styles.btn} ${styles.btnPrimary}`}>
                  View Tree
                </a>
              </div>
            </>
          ) : job?.status === 'failed' ? (
            <>
              <div className={styles.completionIcon}>❌</div>
              <div className={styles.completionTitle}>Import Failed</div>
              {job.error_message && <div className={styles.error}>{job.error_message}</div>}
              <div className={styles.actions}>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={resetAll}
                >
                  Try Again
                </button>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
};

export default ImportPage;

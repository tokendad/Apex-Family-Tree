import React, { useEffect, useRef, useCallback } from 'react';
import Button from '@/components/Button/Button';
import styles from './WizardModal.module.css';

interface WizardModalProps {
  open: boolean;
  title: string;
  stepIndicator?: React.ReactNode;
  currentStep: number;
  totalSteps: number;
  isDirty: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onSave: () => void;
  children: React.ReactNode;
}

const WizardModal: React.FC<WizardModalProps> = ({
  open,
  title,
  stepIndicator,
  currentStep,
  totalSteps,
  isDirty,
  isSaving = false,
  onClose,
  onBack,
  onNext,
  onSave,
  children,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const confirmClose = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm('You have unsaved changes. Discard them?');
      if (!ok) return;
    }
    onClose();
  }, [isDirty, onClose]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirmClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, confirmClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length) focusable[0].focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modalRef.current) return;
      const els = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Prevent body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const isFirst = currentStep === 1;
  const isLast = currentStep === totalSteps;

  return (
    <>
      <div className={styles.backdrop} onClick={confirmClose} />
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>{title}</h2>
            {stepIndicator}
          </div>
          <button
            className={styles.closeBtn}
            onClick={confirmClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={onBack} disabled={isSaving}>
                Back
              </Button>
            )}
          </div>
          <div className={styles.footerRight}>
            {isLast ? (
              <Button variant="primary" size="sm" onClick={onSave} loading={isSaving}>
                Save
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={onNext} disabled={isSaving}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default WizardModal;

import React, { useCallback, useEffect, useRef } from 'react';
import FocusTrap from '@/components/FocusTrap/FocusTrap';
import styles from './BottomDrawer.module.css';

interface BottomDrawerProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 80;

const BottomDrawer: React.FC<BottomDrawerProps> = ({ open, title, onClose, children }) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchCurrentY.current = e.touches[0].clientY;
    const delta = touchCurrentY.current - touchStartY.current;

    // Only allow dragging downward
    if (delta > 0 && drawerRef.current) {
      drawerRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const delta = touchCurrentY.current - touchStartY.current;

    if (drawerRef.current) {
      drawerRef.current.style.transform = '';
    }

    if (delta > SWIPE_THRESHOLD) {
      onClose();
    }
  }, [onClose]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

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

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <FocusTrap active={open}>
        <div
          ref={drawerRef}
          className={styles.drawer}
          role="dialog"
          aria-modal="true"
          aria-label={title ?? 'Drawer'}
        >
          <div
            className={styles.handle}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className={styles.handleBar} />
          </div>
          {title && (
            <div className={styles.header}>
              <span className={styles.title}>{title}</span>
              <button className={styles.closeBtn} onClick={onClose} aria-label="Close drawer">
                <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <div className={styles.body}>{children}</div>
        </div>
      </FocusTrap>
    </>
  );
};

export default BottomDrawer;

import React, { useState } from 'react';
import styles from './CollapsibleSection.module.css';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultOpen = true,
  actionLabel,
  onAction,
  children,
  className,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  const cls = [styles.section, className].filter(Boolean).join(' ');
  const bodyWrapperCls = [styles.bodyWrapper, open ? styles.bodyWrapperOpen : '']
    .filter(Boolean)
    .join(' ');
  const chevronCls = [styles.chevron, open ? styles.chevronOpen : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <div
        className={styles.header}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <div className={styles.headerLeft}>
          <span className={styles.title}>{title}</span>
        </div>
        <div className={styles.headerRight}>
          {actionLabel && (
            <button
              type="button"
              className={styles.actionLink}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.();
              }}
            >
              {actionLabel}
            </button>
          )}
          <span className={chevronCls} aria-hidden="true">
            ▾
          </span>
        </div>
      </div>
      <div className={bodyWrapperCls}>
        <div className={styles.body}>
          <div className={styles.bodyInner}>{children}</div>
        </div>
      </div>
    </div>
  );
};

export default CollapsibleSection;

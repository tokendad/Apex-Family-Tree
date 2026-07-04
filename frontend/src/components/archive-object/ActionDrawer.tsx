import React, { useEffect } from 'react';
import styles from './ActionDrawer.module.css';

interface ActionDrawerProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}

const ActionDrawer: React.FC<ActionDrawerProps> = ({ open, title, description, children, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="action-drawer-title">
        <div className={styles.header}>
          <div>
            <h2 id="action-drawer-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close drawer">×</button>
        </div>
        {children}
      </aside>
    </div>
  );
};

export default ActionDrawer;

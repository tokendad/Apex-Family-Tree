import React, { useEffect, useRef, useState } from 'react';
import Button from '@/components/Button/Button';
import styles from './ContextActionsMenu.module.css';

export interface ContextActionItem {
  id: string;
  label: string;
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Menu section: creation actions (default) or management actions under a "Manage" header. */
  group?: 'create' | 'manage';
}

interface ContextActionsMenuProps {
  label?: string;
  /** Menu heading, e.g. "Actions for John LeFort". Falls back to "Actions". */
  title?: string;
  actions: ContextActionItem[];
}

const ContextActionsMenu: React.FC<ContextActionsMenuProps> = ({ label = 'Actions', title, actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const createActions = actions.filter((action) => (action.group ?? 'create') === 'create');
  const manageActions = actions.filter((action) => action.group === 'manage');

  const renderAction = (action: ContextActionItem) => (
    <button
      key={action.id}
      type="button"
      role="menuitem"
      className={`${styles.action} ${action.danger ? styles.danger : ''}`}
      disabled={action.disabled}
      onClick={() => {
        setOpen(false);
        action.onSelect();
      }}
    >
      <strong>{action.label}</strong>
      {action.description && <span>{action.description}</span>}
    </button>
  );

  return (
    <div className={styles.wrap} ref={ref}>
      <Button
        type="button"
        variant="primary"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </Button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Context actions">
          <div className={styles.menuTitle}>{title ?? 'Actions'}</div>
          {createActions.map(renderAction)}
          {manageActions.length > 0 && <div className={styles.menuTitle}>Manage</div>}
          {manageActions.map(renderAction)}
        </div>
      )}
    </div>
  );
};

export default ContextActionsMenu;

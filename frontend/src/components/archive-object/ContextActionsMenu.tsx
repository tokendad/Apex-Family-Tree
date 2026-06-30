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
}

interface ContextActionsMenuProps {
  label?: string;
  actions: ContextActionItem[];
}

const ContextActionsMenu: React.FC<ContextActionsMenuProps> = ({ label = 'Actions', actions }) => {
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

  return (
    <div className={styles.wrap} ref={ref}>
      <Button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        {label}
      </Button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Context actions">
          <div className={styles.menuTitle}>Actions</div>
          {actions.map((action) => (
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
          ))}
        </div>
      )}
    </div>
  );
};

export default ContextActionsMenu;

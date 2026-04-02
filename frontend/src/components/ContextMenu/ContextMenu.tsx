import React, { useEffect, useRef, useCallback } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useAuth } from '@/contexts/AuthContext.js';
import styles from './ContextMenu.module.css';

interface ContextMenuProps {
  onEditPerson?: (personId: string) => void;
  onAddParent?: (personId: string) => void;
  onAddSpouse?: (personId: string) => void;
  onAddChild?: (personId: string) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  onEditPerson,
  onAddParent,
  onAddSpouse,
  onAddChild,
}) => {
  const { contextMenuPosition, setContextMenu, setSelectedPerson } = useCanvasStore();
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setContextMenu(null), [setContextMenu]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [close]);

  // Adjust position to stay in viewport
  useEffect(() => {
    if (!contextMenuPosition || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let { x, y } = contextMenuPosition;
    if (x + rect.width > vw) x = vw - rect.width - 8;
    if (y + rect.height > vh) y = vh - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;

    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${y}px`;
  }, [contextMenuPosition]);

  if (!contextMenuPosition) return null;

  const isAdmin = user?.role === 'admin';

  const handleAction = (action: string) => {
    const { personId } = contextMenuPosition;
    close();

    switch (action) {
      case 'view':
        setSelectedPerson(personId);
        break;
      case 'edit':
        onEditPerson?.(personId);
        break;
      case 'add-parent':
        onAddParent?.(personId);
        break;
      case 'add-spouse':
        onAddSpouse?.(personId);
        break;
      case 'add-child':
        onAddChild?.(personId);
        break;
      case 'set-home':
      case 'delete':
        break;
    }
  };

  return (
    <>
      <div className={styles.overlay} onClick={close} />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
        role="menu"
      >
        <button className={styles.item} role="menuitem" onClick={() => handleAction('view')}>
          View Details
        </button>
        <button className={styles.item} role="menuitem" onClick={() => handleAction('edit')}>
          Edit Person
        </button>
        <div className={styles.separator} />
        <button className={styles.item} role="menuitem" onClick={() => handleAction('add-parent')}>
          Add Parent
        </button>
        <button className={styles.item} role="menuitem" onClick={() => handleAction('add-spouse')}>
          Add Spouse
        </button>
        <button className={styles.item} role="menuitem" onClick={() => handleAction('add-child')}>
          Add Child
        </button>
        <div className={styles.separator} />
        <button className={styles.item} role="menuitem" onClick={() => handleAction('set-home')}>
          Set as Home Person
        </button>
        {isAdmin && (
          <>
            <div className={styles.separator} />
            <button
              className={`${styles.item} ${styles.danger}`}
              role="menuitem"
              onClick={() => handleAction('delete')}
            >
              Delete Person
            </button>
          </>
        )}
      </div>
    </>
  );
};

export default ContextMenu;

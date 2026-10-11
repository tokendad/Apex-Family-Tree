import React, { useEffect, useRef, useCallback } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useAuth } from '@/contexts/AuthContext.js';
import styles from './ContextMenu.module.css';

interface ContextMenuProps {
  onEditPerson?: (personId: string) => void;
  onAddParent?: (personId: string) => void;
  onAddSpouse?: (personId: string) => void;
  onAddChild?: (personId: string) => void;
  /**
   * What "View Details" does. The main tree selects the person, which opens
   * its detail panel; a page without one can navigate instead.
   */
  onViewDetails?: (personId: string) => void;
  /** Make this person the one the tree opens on. */
  onSetHomePerson?: (personId: string) => void;
  /**
   * Deleting a person is not built yet. The entry only appears once a page
   * supplies a handler, so the menu never offers an action that does nothing —
   * least of all a destructive-looking one.
   */
  onDeletePerson?: (personId: string) => void;
  /**
   * Omit entries that this page cannot carry out, rather than showing a menu
   * item that does nothing when clicked. Off by default so the main tree is
   * unaffected.
   */
  hideUnavailable?: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  onEditPerson,
  onAddParent,
  onAddSpouse,
  onAddChild,
  onViewDetails,
  onSetHomePerson,
  onDeletePerson,
  hideUnavailable = false,
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
        if (onViewDetails) onViewDetails(personId);
        else setSelectedPerson(personId);
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
        onSetHomePerson?.(personId);
        break;
      case 'delete':
        onDeletePerson?.(personId);
        break;
    }
  };

  // An entry appears if it has somewhere to go, or if this page has not asked
  // for unavailable entries to be hidden.
  const show = (available: boolean) => available || !hideUnavailable;

  return (
    <>
      <div className={styles.overlay} onClick={close} />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
        role="menu"
      >
        {show(true) && (
          <button className={styles.item} role="menuitem" onClick={() => handleAction('view')}>
            View Details
          </button>
        )}
        {show(!!onEditPerson) && (
          <button className={styles.item} role="menuitem" onClick={() => handleAction('edit')}>
            Edit Person
          </button>
        )}
        {show(!!onAddParent || !!onAddSpouse || !!onAddChild) && <div className={styles.separator} />}
        {show(!!onAddParent) && (
          <button className={styles.item} role="menuitem" onClick={() => handleAction('add-parent')}>
            Add Parent
          </button>
        )}
        {show(!!onAddSpouse) && (
          <button className={styles.item} role="menuitem" onClick={() => handleAction('add-spouse')}>
            Add Spouse
          </button>
        )}
        {show(!!onAddChild) && (
          <button className={styles.item} role="menuitem" onClick={() => handleAction('add-child')}>
            Add Child
          </button>
        )}
        {onSetHomePerson && <div className={styles.separator} />}
        {onSetHomePerson && (
          <button className={styles.item} role="menuitem" onClick={() => handleAction('set-home')}>
            Set as Home Person
          </button>
        )}
        {isAdmin && onDeletePerson && (
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

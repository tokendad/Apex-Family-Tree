import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import FocusTrap from '@/components/FocusTrap/FocusTrap';
import PersonEditor from '@/components/entity-editors/PersonEditor';
import FamilyEditor from '@/components/entity-editors/FamilyEditor';
import MediaEditor from '@/components/entity-editors/MediaEditor';
import { useModalStore } from './modalStore';
import type { ModalEditorProps, ModalResult } from './modalTypes';
import styles from './ModalManager.module.css';

export type ModalRegistry = Record<
  string,
  React.ComponentType<ModalEditorProps & Record<string, unknown>>
>;

// Registry is populated after editor components are created (Tasks 7 & 8).
// Import editors here once they exist.
export const REGISTRY: ModalRegistry = {
  PersonEditor: PersonEditor as unknown as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
  FamilyEditor: FamilyEditor as unknown as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
  MediaEditor: MediaEditor as unknown as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
};

interface ModalManagerProps {
  registry?: ModalRegistry;
}

const ModalManager: React.FC<ModalManagerProps> = ({ registry = REGISTRY }) => {
  const stack = useModalStore((s) => s.stack);
  const pop = useModalStore((s) => s.pop);

  const closeTop = (result: ModalResult<unknown> = { action: 'cancelled' }) => {
    if (stack.length === 0) return;
    pop(stack[stack.length - 1].id, result);
  };

  useEffect(() => {
    if (stack.length === 0) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTop();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [stack, pop]);

  if (stack.length === 0) return null;

  return ReactDOM.createPortal(
    <>
      <div
        className={styles.backdrop}
        data-testid="modal-backdrop"
        aria-hidden="true"
        onClick={() => closeTop()}
      />
      {stack.map((entry, i) => {
        const Component = registry[entry.component];
        if (!Component) return null;
        const isTop = i === stack.length - 1;
        return (
          <div
            key={entry.id}
            className={`${styles.layer}${!isTop ? ` ${styles.layerInactive}` : ''}`}
            style={{ zIndex: `calc(var(--z-modal) + ${i})` }}
          >
            <FocusTrap active={isTop}>
              <Component
                {...entry.props}
                modalId={entry.id}
                onClose={(result: ModalResult<unknown>) => pop(entry.id, result)}
              />
            </FocusTrap>
          </div>
        );
      })}
    </>,
    document.body
  );
};

export default ModalManager;

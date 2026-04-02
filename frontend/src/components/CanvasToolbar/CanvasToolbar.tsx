import React from 'react';
import Button from '@/components/Button/Button';
import { useCanvasStore } from '@/stores/canvasStore';
import styles from './CanvasToolbar.module.css';

interface CanvasToolbarProps {
  onAddPerson?: () => void;
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({ onAddPerson }) => {
  const { zoom, zoomIn, zoomOut, resetView } = useCanvasStore();

  return (
    <div className={styles.toolbar}>
      <Button variant="primary" size="sm" onClick={onAddPerson}>
        Add Person
      </Button>
      <Button variant="ghost" size="sm">
        Import GEDCOM
      </Button>

      <div className={styles.separator} />

      <div className={styles.zoomGroup}>
        <button
          className={styles.zoomBtn}
          onClick={zoomOut}
          aria-label="Zoom out"
        >
          −
        </button>
        <span className={styles.zoomLabel}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          className={styles.zoomBtn}
          onClick={zoomIn}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      <button
        className={styles.resetBtn}
        onClick={resetView}
        aria-label="Reset view"
        title="Reset view"
      >
        ⟲
      </button>
    </div>
  );
};

export default CanvasToolbar;

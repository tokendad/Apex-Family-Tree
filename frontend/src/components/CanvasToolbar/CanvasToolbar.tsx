import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/Button/Button';
import { useCanvasStore } from '@/stores/canvasStore';
import styles from './CanvasToolbar.module.css';

type TreeFilter = 'all' | 'unconnected-people' | 'unconnected-trees';

interface CanvasToolbarProps {
  onAddPerson?: () => void;
  treeFilter?: TreeFilter;
  onTreeFilterChange?: (filter: TreeFilter) => void;
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({ onAddPerson, treeFilter = 'all', onTreeFilterChange }) => {
  const navigate = useNavigate();
  const { zoom, zoomIn, zoomOut, resetView, fitToScreen } = useCanvasStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 1200, h: 700 });

  // Track the parent canvas container size for fitToScreen
  useEffect(() => {
    const toolbar = containerRef.current;
    const parent = toolbar?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ w: width, h: height });
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={styles.toolbar} ref={containerRef}>
      <Button variant="primary" size="sm" onClick={onAddPerson}>
        Add Person
      </Button>
      <Button variant="ghost" size="sm" onClick={() => navigate('/import')}>
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
        aria-label="Center on home person"
        title="Center on home person"
      >
        🏠
      </button>
      <button
        className={styles.resetBtn}
        onClick={() => fitToScreen(viewport.w, viewport.h)}
        aria-label="Fit entire tree"
        title="Fit entire tree"
      >
        ⊞
      </button>

      <div className={styles.separator} />

      <select
        className={styles.filterSelect}
        value={treeFilter}
        aria-label="Filter tree"
        onChange={(e) => onTreeFilterChange?.(e.target.value as TreeFilter)}
      >
        <option value="all">All</option>
        <option value="unconnected-people">Unconnected People</option>
        <option value="unconnected-trees">Unconnected Trees</option>
      </select>
    </div>
  );
};

export default CanvasToolbar;

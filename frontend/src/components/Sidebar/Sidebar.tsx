import React, { useState } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import styles from './Sidebar.module.css';

type ViewMode = 'ancestry' | 'descendants' | 'full';

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const { generations, setGenerations, nodes } = useCanvasStore();

  return (
    <>
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.content}>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>View</span>
            <div className={styles.radioGroup}>
              {(['ancestry', 'descendants', 'full'] as const).map((mode) => (
                <label key={mode} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="viewMode"
                    value={mode}
                    checked={viewMode === mode}
                    onChange={() => setViewMode(mode)}
                    className={styles.radioInput}
                  />
                  {mode === 'ancestry' ? 'Ancestry' : mode === 'descendants' ? 'Descendants' : 'Full Tree'}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Generations</span>
            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabel}>
                <span>Depth</span>
                <span className={styles.sliderValue}>{generations}</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={generations}
                onChange={(e) => setGenerations(Number(e.target.value))}
                className={styles.slider}
              />
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.stats}>
            {nodes.length} {nodes.length === 1 ? 'person' : 'people'} in tree
          </span>
        </div>
      </aside>

      <button
        className={styles.toggleBtn}
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{ left: collapsed ? 0 : 260 }}
      >
        {collapsed ? '›' : '‹'}
      </button>
    </>
  );
};

export default Sidebar;

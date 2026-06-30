import React, { useState } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import SearchSidebar from '@/components/SearchSidebar/SearchSidebar';
import Divider from '@/components/Divider/Divider';
import styles from './Sidebar.module.css';

type ViewMode = 'ancestry' | 'descendants' | 'full';

export type SidebarContext = 'tree' | 'people' | 'families' | 'sources' | 'media' | 'artifacts' | 'events' | 'places';

interface SidebarProps {
  context?: SidebarContext;
}

const Sidebar: React.FC<SidebarProps> = ({ context = 'tree' }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const { generations, setGenerations, nodes } = useCanvasStore();

  const isTree = context === 'tree';

  return (
    <>
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.content}>
          {isTree && (
            <>
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

              <Divider />
            </>
          )}

          <SearchSidebar context={context} />
        </div>

        {isTree && (
          <div className={styles.footer}>
            <span className={styles.stats}>
              {nodes.length} {nodes.length === 1 ? 'person' : 'people'} in tree
            </span>
          </div>
        )}
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

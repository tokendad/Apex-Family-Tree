import React from 'react';
import styles from './CanvasLegend.module.css';

const LEGEND_ITEMS = [
  { color: '#3b82f6', label: 'Male' },
  { color: '#ec4899', label: 'Female' },
  { color: '#14b8a6', label: 'Other' },
];

const CanvasLegend: React.FC = () => {
  return (
    <div className={styles.legend}>
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className={styles.item}>
          <span
            className={styles.swatch}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
};

export default CanvasLegend;

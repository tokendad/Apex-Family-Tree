import React from 'react';
import styles from './StepDot.module.css';

type StepStatus = 'done' | 'current' | 'pending';

interface StepDotProps {
  status: StepStatus;
  step: number;
  label?: string;
  className?: string;
}

const StepDot: React.FC<StepDotProps> = ({ status, step, label, className }) => {
  const cls = [styles.step, className].filter(Boolean).join(' ');
  const dotCls = [styles.dot, styles[status]].join(' ');

  return (
    <div className={cls}>
      <div className={dotCls}>
        {status === 'done' ? '✓' : step}
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
};

export default StepDot;

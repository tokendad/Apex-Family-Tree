import React from 'react';
import styles from './Divider.module.css';

interface DividerProps {
  className?: string;
}

const Divider: React.FC<DividerProps> = ({ className }) => {
  const cls = [styles.divider, className].filter(Boolean).join(' ');
  return <hr className={cls} />;
};

export default Divider;

import React from 'react';
import styles from './HelperText.module.css';

interface HelperTextProps {
  variant?: 'info' | 'error';
  children: React.ReactNode;
  className?: string;
}

const HelperText: React.FC<HelperTextProps> = ({
  variant = 'info',
  children,
  className,
}) => {
  const cls = [styles.helperText, styles[variant], className]
    .filter(Boolean)
    .join(' ');
  return <span className={cls}>{children}</span>;
};

export default HelperText;

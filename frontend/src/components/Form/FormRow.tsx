import React from 'react';
import styles from './FormRow.module.css';

interface FormRowProps {
  children: React.ReactNode;
  className?: string;
}

const FormRow: React.FC<FormRowProps> = ({ children, className }) => {
  const cls = [styles.formRow, className].filter(Boolean).join(' ');
  return <div className={cls}>{children}</div>;
};

export default FormRow;

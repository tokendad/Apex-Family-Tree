import React from 'react';
import styles from './FormGroup.module.css';

interface FormGroupProps {
  children: React.ReactNode;
  className?: string;
}

const FormGroup: React.FC<FormGroupProps> = ({ children, className }) => {
  const cls = [styles.formGroup, className].filter(Boolean).join(' ');
  return <div className={cls}>{children}</div>;
};

export default FormGroup;

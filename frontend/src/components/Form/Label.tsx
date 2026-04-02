import React from 'react';
import styles from './Label.module.css';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

const Label: React.FC<LabelProps> = ({ required, children, className, ...rest }) => {
  const cls = [styles.label, required ? styles.required : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <label className={cls} {...rest}>
      {children}
    </label>
  );
};

export default Label;

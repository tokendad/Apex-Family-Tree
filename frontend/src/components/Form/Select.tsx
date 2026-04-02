import React from 'react';
import styles from './Select.module.css';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className, children, ...rest }, ref) => {
    const cls = [styles.select, error ? styles.error : '', className]
      .filter(Boolean)
      .join(' ');
    return (
      <select ref={ref} className={cls} {...rest}>
        {children}
      </select>
    );
  },
);

Select.displayName = 'Select';

export default Select;

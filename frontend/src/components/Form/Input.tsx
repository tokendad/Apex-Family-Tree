import React from 'react';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, type = 'text', ...rest }, ref) => {
    const cls = [styles.input, error ? styles.error : '', className]
      .filter(Boolean)
      .join(' ');
    return <input ref={ref} className={cls} type={type} {...rest} />;
  },
);

Input.displayName = 'Input';

export default Input;

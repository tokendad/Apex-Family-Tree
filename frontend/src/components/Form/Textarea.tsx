import React from 'react';
import styles from './Textarea.module.css';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...rest }, ref) => {
    const cls = [styles.textarea, error ? styles.error : '', className]
      .filter(Boolean)
      .join(' ');
    return <textarea ref={ref} className={cls} {...rest} />;
  },
);

Textarea.displayName = 'Textarea';

export default Textarea;

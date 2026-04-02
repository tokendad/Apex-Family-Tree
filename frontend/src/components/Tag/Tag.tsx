import React from 'react';
import styles from './Tag.module.css';

interface TagProps {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

const Tag: React.FC<TagProps> = ({ selected = false, onClick, children, className }) => {
  const cls = [styles.tag, selected ? styles.selected : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
};

export default Tag;

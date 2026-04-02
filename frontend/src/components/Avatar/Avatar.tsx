import React from 'react';
import styles from './Avatar.module.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface AvatarProps {
  name: string;
  src?: string;
  size?: AvatarSize;
  className?: string;
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 8;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', className }) => {
  const colorClass = styles[`color${hashName(name)}`];
  const cls = [styles.avatar, styles[size], src ? '' : colorClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} title={name} aria-label={name} role="img">
      {src ? (
        <img className={styles.image} src={src} alt={name} />
      ) : (
        getInitials(name)
      )}
    </div>
  );
};

export default Avatar;

import React from 'react';
import styles from './Badge.module.css';

type RoleVariant = 'admin' | 'editor' | 'limited_editor' | 'viewer';
type StatusVariant = 'active' | 'inactive' | 'suspended' | 'invited';

interface BadgeProps {
  variant: RoleVariant | StatusVariant;
  children: React.ReactNode;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ variant, children, className }) => {
  const cls = [styles.badge, styles[variant], className].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
};

export default Badge;

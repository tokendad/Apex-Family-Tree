import React from 'react';
import styles from './InfoBox.module.css';

interface InfoBoxProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const InfoBox: React.FC<InfoBoxProps> = ({ icon, children, className }) => {
  const cls = [styles.infoBox, className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <div className={styles.content}>{children}</div>
    </div>
  );
};

export default InfoBox;

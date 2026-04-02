import React from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import styles from './OfflineBanner.module.css';

const OfflineBanner: React.FC = () => {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div className={styles.banner} role="alert">
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
      </svg>
      You are offline. Some features may not work.
    </div>
  );
};

export default OfflineBanner;

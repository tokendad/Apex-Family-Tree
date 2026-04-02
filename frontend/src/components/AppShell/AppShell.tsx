import React from 'react';
import styles from './AppShell.module.css';

interface AppShellProps {
  navbar: React.ReactNode;
  sidebar: React.ReactNode;
  detail?: React.ReactNode;
  showDetail?: boolean;
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({
  navbar,
  sidebar,
  detail,
  showDetail = false,
  children,
}) => {
  return (
    <div className={styles.shell}>
      {navbar}
      <div className={styles.body}>
        {sidebar}
        <main className={styles.main}>{children}</main>
        <div
          className={
            showDetail && detail ? styles.detailPanel : styles.detailPanelHidden
          }
        >
          {detail}
        </div>
      </div>
    </div>
  );
};

export default AppShell;

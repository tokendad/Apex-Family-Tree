import React from 'react';
import StatusBar from '@/components/StatusBar/StatusBar';
import type { SidebarContext } from '@/stores/searchStore';
import styles from './AppShell.module.css';

interface AppShellProps {
  navbar: React.ReactNode;
  sidebar: React.ReactNode;
  detail?: React.ReactNode;
  showDetail?: boolean;
  /** Current page context — used for context-aware StatusBar */
  context?: SidebarContext;
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({
  navbar,
  sidebar,
  detail,
  showDetail = false,
  context,
  children,
}) => {
  return (
    <div className={styles.shell}>
      {navbar}
      <div className={styles.body}>
        {sidebar}
        <div className={styles.mainWrapper}>
          <main className={styles.main}>{children}</main>
          <StatusBar context={context} />
        </div>
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

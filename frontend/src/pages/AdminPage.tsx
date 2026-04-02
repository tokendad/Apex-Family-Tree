import { Link } from 'react-router-dom';
import styles from './AdminPage.module.css';

export default function AdminPage() {
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Administration</h1>
      <p className={styles.subtitle}>Manage your Apex Family Tree instance.</p>

      <div className={styles.grid}>
        <Link to="/admin/users" className={styles.card}>
          <div className={styles.cardIcon}>👥</div>
          <h2 className={styles.cardTitle}>User Management</h2>
          <p className={styles.cardDesc}>
            Manage users, roles, and invitations. View active sessions and control access to your family tree.
          </p>
        </Link>

        <Link to="/admin/settings" className={styles.card}>
          <div className={styles.cardIcon}>⚙️</div>
          <h2 className={styles.cardTitle}>Settings</h2>
          <p className={styles.cardDesc}>
            Configure application settings, SMTP email, and feature flags for your instance.
          </p>
        </Link>
      </div>
    </div>
  );
}

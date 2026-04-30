import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.js';
import Avatar from '@/components/Avatar/Avatar';
import styles from './Navbar.module.css';

const NAV_ITEMS = [
  { label: 'Tree', path: '/' },
  { label: 'People', path: '/people' },
  { label: 'Families', path: '/families' },
  { label: 'Sources', path: '/sources' },
  { label: 'Media', path: '/media' },
];

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/tree';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className={styles.navbar}>
      <Link to="/" className={styles.logo}>
        <svg className={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v6m0 0l-3-3m3 3l3-3M5 21h14a2 2 0 002-2v-4a2 2 0 00-2-2h-4m-6 0H5a2 2 0 00-2 2v4a2 2 0 002 2" />
        </svg>
        Apex Family Tree
      </Link>
      <span className={styles.version}>v{__APP_VERSION__}</span>

      <div className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`${styles.navLink} ${isActive(item.path) ? styles.navLinkActive : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className={styles.spacer} />

      {user && (
        <div className={styles.userArea} ref={dropdownRef}>
          <button
            className={styles.userButton}
            onClick={() => setDropdownOpen((v) => !v)}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <Avatar name={user.display_name} size="xs" />
            <span className={styles.userName}>{user.display_name}</span>
          </button>

          {dropdownOpen && (
            <div className={styles.dropdown} role="menu">
              <button
                className={`${styles.dropdownItem} ${styles.dropdownDanger}`}
                role="menuitem"
                onClick={() => {
                  setDropdownOpen(false);
                  void logout();
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;

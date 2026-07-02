import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.js';
import { usePageActionsValue } from '@/contexts/PageActionsContext';
import Avatar from '@/components/Avatar/Avatar';
import ContextActionsMenu from '@/components/archive-object/ContextActionsMenu';
import styles from './Navbar.module.css';

const NAV_ITEMS = [
  { label: 'Tree', path: '/' },
  { label: 'People', path: '/people' },
  { label: 'Families', path: '/families' },
  { label: 'Artifacts', path: '/artifacts' },
  { label: 'Claims', path: '/claims' },
  { label: 'Collections', path: '/collections' },
  { label: 'Stories', path: '/stories' },
  { label: 'Search', path: '/search' },
  { label: 'Events', path: '/events' },
  { label: 'Places', path: '/places' },
  { label: 'Sources', path: '/sources' },
  { label: 'Media', path: '/media' },
];

const ROLE_RANK = {
  viewer: 0,
  limited_editor: 1,
  editor: 2,
  admin: 3,
} as const;

type Role = keyof typeof ROLE_RANK;

function hasMinimumRole(role: string | undefined, minimum: Role): boolean {
  if (!role || !(role in ROLE_RANK)) return false;
  return ROLE_RANK[role as Role] >= ROLE_RANK[minimum];
}

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { title: actionsTitle, actions: pageActions } = usePageActionsValue();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const visibleNavItems = [
    ...NAV_ITEMS,
    ...(hasMinimumRole(user?.role, 'editor') ? [{ label: 'Tools', path: '/tools' }] : []),
    ...(user?.role === 'admin' ? [{ label: 'Admin', path: '/admin' }] : []),
  ];

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

  const submitSearch = () => {
    const q = query.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.topline}>
        <Link to="/" className={styles.brand}>
          <strong>Apex Family Legacy</strong>
          <span>A Digital Family Archive</span>
        </Link>
        <span className={styles.version}>v{__APP_VERSION__}</span>

        <div className={styles.search}>
          <input
            type="search"
            aria-label="Search the archive"
            placeholder="Search the archive..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch();
            }}
          />
        </div>

        <div className={styles.topActions}>
          {pageActions.length > 0 && (
            <ContextActionsMenu title={actionsTitle || undefined} actions={pageActions} />
          )}
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
        </div>
      </div>

      <nav className={styles.navline} aria-label="Primary">
        {visibleNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`${styles.navLink} ${isActive(item.path) ? styles.navLinkActive : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
};

export default Navbar;

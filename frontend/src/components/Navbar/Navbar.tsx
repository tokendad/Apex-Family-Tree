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
  { label: 'Events', path: '/events' },
  { label: 'Places', path: '/places' },
  { label: 'Sources', path: '/sources' },
  { label: 'Media', path: '/media' },
];

// Destinations grouped under the username button (#15). Sections render as a
// flat list with labelled groups rather than nested flyouts — hover-driven
// submenus are hard to operate by keyboard and on touch, and at this size they
// buy nothing. `external` items leave the app, so they render as plain anchors.
//
// Section labels ('Help', 'Profile') are headings only and never navigate. Per-user
// profile settings live under Profile > Settings rather than at a /profile page.
const GITHUB_URL = 'https://github.com/tokendad/Apex-Family-Tree';

interface UserMenuItem {
  label: string;
  path: string;
  external?: boolean;
}

interface UserMenuSection {
  id: string;
  label: string;
  items: UserMenuItem[];
}

const USER_MENU_SECTIONS: UserMenuSection[] = [
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'About', path: '/about' },
      { label: 'FAQ', path: '/faq' },
      { label: 'Glossary', path: '/glossary' },
      { label: 'GitHub', path: GITHUB_URL, external: true },
    ],
  },
  {
    id: 'profile',
    label: 'Profile',
    items: [
      { label: 'Theme', path: '/profile/theme' },
      { label: 'Settings', path: '/profile/settings' },
    ],
  },
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
  const userButtonRef = useRef<HTMLButtonElement>(null);
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

  // Escape should dismiss the menu and hand focus back to the button that
  // opened it, otherwise keyboard users land nowhere after closing.
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDropdownOpen(false);
        userButtonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [dropdownOpen]);

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
                ref={userButtonRef}
                className={styles.userButton}
                onClick={() => setDropdownOpen((v) => !v)}
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
              >
                <Avatar name={user.display_name} size="xs" />
                <span className={styles.userName}>{user.display_name}</span>
              </button>

              {dropdownOpen && (
                <div className={styles.dropdown} role="menu" aria-label="Account menu">
                  {USER_MENU_SECTIONS.map((section) => (
                    <div
                      key={section.id}
                      role="group"
                      aria-labelledby={`user-menu-${section.id}`}
                      className={styles.dropdownGroup}
                    >
                      <span
                        id={`user-menu-${section.id}`}
                        className={styles.dropdownSectionLabel}
                      >
                        {section.label}
                      </span>
                      {section.items.map((item) =>
                        item.external ? (
                          <a
                            key={item.label}
                            href={item.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            role="menuitem"
                            className={styles.dropdownItem}
                            onClick={() => setDropdownOpen(false)}
                          >
                            {item.label}
                            <span aria-hidden="true" className={styles.externalMark}>
                              &#8599;
                            </span>
                            <span className={styles.srOnly}>(opens in a new tab)</span>
                          </a>
                        ) : (
                          <Link
                            key={item.label}
                            to={item.path}
                            role="menuitem"
                            className={styles.dropdownItem}
                            onClick={() => setDropdownOpen(false)}
                          >
                            {item.label}
                          </Link>
                        )
                      )}
                    </div>
                  ))}

                  <div className={styles.dropdownDivider} role="separator" />

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

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import Button from '@/components/Button/Button';
import Badge from '@/components/Badge/Badge';
import Avatar from '@/components/Avatar/Avatar';
import InviteUserModal from '@/components/InviteUserModal/InviteUserModal';
import styles from './AdminUsersPage.module.css';

interface SafeUser {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'limited_editor' | 'viewer';
  status: 'active' | 'inactive' | 'suspended';
  last_login_at: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  limited_editor: 'Limited Editor',
  viewer: 'Viewer',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users);
      setRoleCounts(data.roleCounts);
      setError('');
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenu]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setOpenMenu(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update role');
        return;
      }
      fetchUsers();
    } catch {
      setError('Failed to update user role');
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: string) => {
    setOpenMenu(null);
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update status');
        return;
      }
      fetchUsers();
    } catch {
      setError('Failed to update user status');
    }
  };

  const handleDelete = async (userId: string, displayName: string) => {
    setOpenMenu(null);
    if (!window.confirm(`Are you sure you want to delete "${displayName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete user');
        return;
      }
      fetchUsers();
    } catch {
      setError('Failed to delete user');
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading users…</div>;
  }

  const roleCards = ['admin', 'editor', 'limited_editor', 'viewer'];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>User Management</h1>
        <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
          Invite User
        </Button>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.roleSummary}>
        {roleCards.map(role => (
          <div key={role} className={styles.roleCard}>
            <p className={styles.roleCardCount}>{roleCounts[role] || 0}</p>
            <p className={styles.roleCardLabel}>{ROLE_LABELS[role]}</p>
          </div>
        ))}
      </div>

      <div className={styles.tableWrap}>
        {users.length === 0 ? (
          <div className={styles.emptyState}>No users found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className={styles.userCell}>
                      <Avatar name={u.display_name} size="sm" />
                      <div>
                        <div className={styles.userName}>{u.display_name}</div>
                        <div className={styles.userEmail}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge variant={u.role}>{ROLE_LABELS[u.role]}</Badge>
                  </td>
                  <td>
                    <Badge variant={u.status}>{STATUS_LABELS[u.status]}</Badge>
                  </td>
                  <td>{formatDate(u.last_login_at)}</td>
                  <td>
                    <div className={styles.actionsWrap} ref={openMenu === u.id ? menuRef : undefined}>
                      <button
                        className={styles.actionsBtn}
                        onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                        aria-label={`Actions for ${u.display_name}`}
                      >
                        ⋯
                      </button>
                      {openMenu === u.id && (
                        <div className={styles.dropdown}>
                          {u.role !== 'admin' && (
                            <button className={styles.dropdownItem} onClick={() => handleRoleChange(u.id, 'admin')}>
                              Make Admin
                            </button>
                          )}
                          {u.role !== 'editor' && (
                            <button className={styles.dropdownItem} onClick={() => handleRoleChange(u.id, 'editor')}>
                              Make Editor
                            </button>
                          )}
                          {u.role !== 'viewer' && (
                            <button className={styles.dropdownItem} onClick={() => handleRoleChange(u.id, 'viewer')}>
                              Make Viewer
                            </button>
                          )}
                          <button
                            className={styles.dropdownItem}
                            onClick={() => handleStatusToggle(u.id, u.status)}
                          >
                            {u.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              className={styles.dropdownItemDanger}
                              onClick={() => handleDelete(u.id, u.display_name)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={fetchUsers}
      />
    </div>
  );
}

export default AdminUsersPage;

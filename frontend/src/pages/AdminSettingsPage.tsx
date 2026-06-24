import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input, Select } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import styles from './AdminSettingsPage.module.css';

type Tab = 'instance' | 'smtp' | 'features';

const DEFAULT_NAME_FORMAT = '%f %m %s';
const SAMPLE_NAME = {
  prefix: 'Dr.',
  givenName: 'Jane',
  middleName: 'Anne',
  surname: 'Smith-Jones',
  marriedSurname: 'Rivera',
  suffix: 'Jr.',
  nickname: 'Jenny',
};

function previewNameFormat(format: string): string {
  return format
    .replaceAll('%mi', SAMPLE_NAME.middleName.charAt(0) + '.')
    .replaceAll('%ms', SAMPLE_NAME.marriedSurname)
    .replaceAll('%f', SAMPLE_NAME.givenName)
    .replaceAll('%m', SAMPLE_NAME.middleName)
    .replaceAll('%s', SAMPLE_NAME.surname)
    .replaceAll('%t', SAMPLE_NAME.prefix)
    .replaceAll('%n', SAMPLE_NAME.nickname)
    .replaceAll('%x', SAMPLE_NAME.suffix)
    .replace(/\s+/g, ' ')
    .trim() || 'Preview unavailable';
}

interface AppSetting {
  key: string;
  value: string | null;
  value_type: string;
  description: string | null;
}

interface FeatureFlag {
  key: string;
  enabled: number;
  description: string | null;
}

function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('instance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Instance settings
  const [instanceName, setInstanceName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [nameFormat, setNameFormat] = useState(DEFAULT_NAME_FORMAT);

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');

  // Feature flags
  const [flags, setFlags] = useState<FeatureFlag[]>([]);

  const [savingInstance, setSavingInstance] = useState(false);
  const [savingNameFormat, setSavingNameFormat] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/settings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();

      const settingsMap = new Map<string, AppSetting>();
      for (const s of data.settings) {
        settingsMap.set(s.key, s);
      }

      setInstanceName(settingsMap.get('instance_name')?.value || '');
      setTimezone(settingsMap.get('timezone')?.value || '');
      setNameFormat(settingsMap.get('name_display_format')?.value || DEFAULT_NAME_FORMAT);
      setSmtpHost(settingsMap.get('smtp_host')?.value || '');
      setSmtpPort(settingsMap.get('smtp_port')?.value || '587');
      setSmtpSecure(settingsMap.get('smtp_secure')?.value === 'true');
      setSmtpUser(settingsMap.get('smtp_user')?.value || '');
      setSmtpPass('');
      setSmtpFrom(settingsMap.get('smtp_from')?.value || '');

      setError('');
    } catch {
      setError('Failed to load settings');
    }
  }, []);

  const loadFlags = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/features', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load flags');
      const data = await res.json();
      setFlags(data.flags);
    } catch {
      setError('Failed to load feature flags');
    }
  }, []);

  useEffect(() => {
    Promise.all([loadSettings(), loadFlags()]).finally(() => setLoading(false));
  }, [loadSettings, loadFlags]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const saveInstanceSettings = async () => {
    clearMessages();
    setSavingInstance(true);
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          settings: {
            instance_name: instanceName,
            timezone: timezone,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save settings');
        return;
      }
      setSuccess('Instance settings saved.');
    } catch {
      setError('Failed to save settings');
    } finally {
      setSavingInstance(false);
    }
  };

  const saveSmtpSettings = async () => {
    clearMessages();
    setSavingSmtp(true);
    try {
      const settings: Record<string, string | boolean> = {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_secure: smtpSecure,
        smtp_user: smtpUser,
        smtp_from: smtpFrom,
      };
      // Only include password if user entered a new one
      if (smtpPass) {
        settings.smtp_pass = smtpPass;
      }

      const res = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save SMTP settings');
        return;
      }
      setSmtpPass('');
      setSuccess('SMTP settings saved.');
    } catch {
      setError('Failed to save SMTP settings');
    } finally {
      setSavingSmtp(false);
    }
  };

  const saveNameFormat = async () => {
    clearMessages();
    if (nameFormat.includes('%D')) {
      setError('Global name format cannot contain %D token');
      return;
    }

    setSavingNameFormat(true);
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings: { name_display_format: nameFormat } }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save name format');
        return;
      }
      setSuccess('Name display format saved.');
    } catch {
      setError('Failed to save name format');
    } finally {
      setSavingNameFormat(false);
    }
  };

  const toggleFlag = async (key: string, currentEnabled: number) => {
    clearMessages();
    try {
      const res = await fetch(`/api/v1/admin/features/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: currentEnabled === 0 }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to toggle flag');
        return;
      }
      setFlags(prev =>
        prev.map(f => (f.key === key ? { ...f, enabled: currentEnabled === 0 ? 1 : 0 } : f))
      );
    } catch {
      setError('Failed to toggle feature flag');
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading settings…</div>;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      {error && <div className={styles.errorMsg}>{error}</div>}
      {success && <div className={styles.successMsg}>{success}</div>}

      <div className={styles.tabs}>
        <button
          className={activeTab === 'instance' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('instance'); clearMessages(); }}
        >
          Instance
        </button>
        <button
          className={activeTab === 'smtp' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('smtp'); clearMessages(); }}
        >
          Email (SMTP)
        </button>
        <button
          className={activeTab === 'features' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('features'); clearMessages(); }}
        >
          Feature Flags
        </button>
      </div>

      {activeTab === 'instance' && (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Instance Settings</h2>
            <div className={styles.fieldGroup}>
              <FormGroup>
                <Label htmlFor="instance-name">Instance Name</Label>
                <Input
                  id="instance-name"
                  value={instanceName}
                  onChange={e => setInstanceName(e.target.value)}
                  placeholder="My Family Tree"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  id="timezone"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                >
                  <option value="">Auto-detect</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern (US)</option>
                  <option value="America/Chicago">Central (US)</option>
                  <option value="America/Denver">Mountain (US)</option>
                  <option value="America/Los_Angeles">Pacific (US)</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris / Berlin</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                  <option value="Australia/Sydney">Sydney</option>
                </Select>
              </FormGroup>
            </div>
            <div className={styles.saveRow}>
              <Button variant="primary" size="sm" onClick={saveInstanceSettings} loading={savingInstance}>
                Save Instance Settings
              </Button>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Name Display Format</h2>
            <div className={styles.fieldGroup}>
              <FormGroup>
                <Label htmlFor="name-display-format">Global Name Format</Label>
                <Input
                  id="name-display-format"
                  value={nameFormat}
                  onChange={e => setNameFormat(e.target.value)}
                  placeholder={DEFAULT_NAME_FORMAT}
                />
              </FormGroup>
              <div className={styles.previewBox}>
                <span className={styles.previewLabel}>Preview</span>
                <span className={styles.previewValue}>{previewNameFormat(nameFormat)}</span>
              </div>
              <details className={styles.tokenDetails}>
                <summary>Token reference</summary>
                <div className={styles.tokenGrid}>
                  <code>%f</code><span>First / given name</span>
                  <code>%m</code><span>Middle name</span>
                  <code>%mi</code><span>Middle initial</span>
                  <code>%s</code><span>Birth surname</span>
                  <code>%ms</code><span>Married surname</span>
                  <code>%t</code><span>Prefix / title</span>
                  <code>%n</code><span>Nickname</span>
                  <code>%x</code><span>Suffix</span>
                  <code>%D</code><span>Not available in global format</span>
                </div>
              </details>
            </div>
            <div className={styles.saveRow}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNameFormat(DEFAULT_NAME_FORMAT)}>
                Reset to Default
              </Button>
              <Button variant="primary" size="sm" onClick={saveNameFormat} loading={savingNameFormat}>
                Save Name Format
              </Button>
            </div>
          </div>
        </>
      )}

      {activeTab === 'smtp' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>SMTP Configuration</h2>
          <div className={styles.fieldGroup}>
            <div className={styles.fieldRow}>
              <FormGroup>
                <Label htmlFor="smtp-host">SMTP Host</Label>
                <Input
                  id="smtp-host"
                  value={smtpHost}
                  onChange={e => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="smtp-port">Port</Label>
                <Input
                  id="smtp-port"
                  value={smtpPort}
                  onChange={e => setSmtpPort(e.target.value)}
                  placeholder="587"
                />
              </FormGroup>
            </div>
            <FormGroup>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={smtpSecure}
                  onChange={e => setSmtpSecure(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
              <Label>Use TLS/SSL</Label>
            </FormGroup>
            <div className={styles.fieldRow}>
              <FormGroup>
                <Label htmlFor="smtp-user">Username</Label>
                <Input
                  id="smtp-user"
                  value={smtpUser}
                  onChange={e => setSmtpUser(e.target.value)}
                  placeholder="your-email@example.com"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="smtp-pass">Password</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={smtpPass}
                  onChange={e => setSmtpPass(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </FormGroup>
            </div>
            <FormGroup>
              <Label htmlFor="smtp-from">From Address</Label>
              <Input
                id="smtp-from"
                type="email"
                value={smtpFrom}
                onChange={e => setSmtpFrom(e.target.value)}
                placeholder="noreply@example.com"
              />
            </FormGroup>
          </div>
          <div className={styles.saveRow}>
            <Button variant="primary" size="sm" onClick={saveSmtpSettings} loading={savingSmtp}>
              Save SMTP Settings
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'features' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Feature Flags</h2>
          {flags.length === 0 ? (
            <div className={styles.emptyFlags}>No feature flags configured.</div>
          ) : (
            <div className={styles.flagList}>
              {flags.map(flag => (
                <div key={flag.key} className={styles.flagItem}>
                  <div className={styles.flagInfo}>
                    <span className={styles.flagKey}>{flag.key}</span>
                    {flag.description && <span className={styles.flagDesc}>{flag.description}</span>}
                  </div>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={flag.enabled === 1}
                      onChange={() => toggleFlag(flag.key, flag.enabled)}
                    />
                    <span className={styles.toggleSlider} />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminSettingsPage;

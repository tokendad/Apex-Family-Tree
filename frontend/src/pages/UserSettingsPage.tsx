import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import ComingSoon from '@/components/ComingSoon/ComingSoon';

export default function UserSettingsPage() {
  return (
    <AppShell navbar={<Navbar />}>
      <ComingSoon
        title="Settings"
        description="Your profile and personal settings. Instance-wide configuration stays under Admin."
        issue={16}
        planned={[
          'Display name and email',
          'Password changes',
          'Your linked home person',
          'Notification and view preferences',
        ]}
      />
    </AppShell>
  );
}

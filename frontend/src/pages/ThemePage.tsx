import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import ComingSoon from '@/components/ComingSoon/ComingSoon';

export default function ThemePage() {
  return (
    <AppShell navbar={<Navbar />}>
      <ComingSoon
        title="Theme"
        description="Choose how the archive looks, including a night mode that applies to your account only rather than the whole instance."
        issue={11}
        planned={[
          'Light and night mode selection',
          'Preference stored per user, not per device',
        ]}
      />
    </AppShell>
  );
}

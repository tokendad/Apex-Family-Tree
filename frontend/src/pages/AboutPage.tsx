import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import ComingSoon from '@/components/ComingSoon/ComingSoon';

export default function AboutPage() {
  return (
    <AppShell navbar={<Navbar />}>
      <ComingSoon
        title="About"
        description="Version, license, and project information for this Apex Family Tree instance."
        planned={[
          'Running version and build details',
          'License and credits',
          'Link to the project repository',
        ]}
      />
    </AppShell>
  );
}

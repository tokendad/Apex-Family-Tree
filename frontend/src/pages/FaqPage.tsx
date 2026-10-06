import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import ComingSoon from '@/components/ComingSoon/ComingSoon';

export default function FaqPage() {
  return (
    <AppShell navbar={<Navbar />}>
      <ComingSoon
        title="FAQ"
        description="Answers to common questions about using the archive."
        planned={[
          'Getting started with your first tree',
          'How artifacts, sources, and claims relate',
          'Importing and exporting GEDCOM data',
        ]}
      />
    </AppShell>
  );
}

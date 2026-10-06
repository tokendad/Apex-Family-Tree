import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import ComingSoon from '@/components/ComingSoon/ComingSoon';

export default function GlossaryPage() {
  return (
    <AppShell navbar={<Navbar />}>
      <ComingSoon
        title="Glossary"
        description="A plain-language guide to the concepts this archive uses, and how they differ from traditional family tree software."
        issue={17}
        planned={[
          'Stories, Collections, and Events',
          'Sources, Claims, and Artifacts',
          'How provenance is tracked across records',
        ]}
      />
    </AppShell>
  );
}

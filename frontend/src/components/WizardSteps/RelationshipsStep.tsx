import React from 'react';
import CollapsibleSection from '@/components/CollapsibleSection/CollapsibleSection';
import PersonSearch from '@/components/PersonSearch/PersonSearch';
import { FormGroup, Label, Input } from '@/components/Form';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import type { WizardFormData } from '@/hooks/usePersonWizard';
import styles from './RelationshipsStep.module.css';

interface RelationshipsStepProps {
  data: WizardFormData;
  onChange: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
}

const RelationshipsStep: React.FC<RelationshipsStepProps> = ({ data, onChange }) => {
  const handleAddParent = (person: PersonResult) => {
    if (data.parents.find((p) => p.id === person.id)) return;
    onChange('parents', [...data.parents, person]);
  };

  const handleRemoveParent = (id: string) => {
    onChange(
      'parents',
      data.parents.filter((p) => p.id !== id),
    );
  };

  const handleAddSpouse = (person: PersonResult) => {
    if (data.spouses.find((s) => s.person.id === person.id)) return;
    onChange('spouses', [...data.spouses, { person, marriageDate: '' }]);
  };

  const handleRemoveSpouse = (id: string) => {
    onChange(
      'spouses',
      data.spouses.filter((s) => s.person.id !== id),
    );
  };

  const handleSpouseMarriageDateChange = (id: string, date: string) => {
    onChange(
      'spouses',
      data.spouses.map((s) =>
        s.person.id === id ? { ...s, marriageDate: date } : s,
      ),
    );
  };

  return (
    <div className={styles.section}>
      <CollapsibleSection title="Parents" defaultOpen>
        <PersonSearch
          onSelect={handleAddParent}
          onCreateNew={() => {
            /* Quick-create could open a nested flow; placeholder for now */
          }}
          selectedPersons={data.parents}
          onRemove={handleRemoveParent}
          placeholder="Search for parent…"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Spouses" defaultOpen>
        <PersonSearch
          onSelect={handleAddSpouse}
          onCreateNew={() => {
            /* Placeholder for quick-create */
          }}
          selectedPersons={data.spouses.map((s) => s.person)}
          onRemove={handleRemoveSpouse}
          placeholder="Search for spouse…"
        />
        {data.spouses.map((spouse) => (
          <div key={spouse.person.id} className={styles.marriageDateRow}>
            <FormGroup>
              <Label>Marriage date — {spouse.person.given_name} {spouse.person.surname}</Label>
              <Input
                placeholder="e.g. 15 Jun 1950"
                value={spouse.marriageDate}
                onChange={(e) =>
                  handleSpouseMarriageDateChange(spouse.person.id, e.target.value)
                }
              />
            </FormGroup>
          </div>
        ))}
      </CollapsibleSection>
    </div>
  );
};

export default RelationshipsStep;

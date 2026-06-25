import React from 'react';
import { useState } from 'react';
import { FormGroup, Label, Input } from '@/components/Form';
import TagPicker from '@/components/TagPicker/TagPicker';
import type { EventData } from '@/components/TagPicker/TagPicker';
import type { WizardFormData } from '@/hooks/usePersonWizard';
import { useModal } from '@/components/modals/useModal';
import styles from './VitalEventsStep.module.css';

const ADDITIONAL_EVENT_TYPES = [
  'Baptism',
  'Christening',
  'Burial',
  'Cremation',
  'Immigration',
  'Emigration',
  'Census',
  'Graduation',
  'Retirement',
];

interface VitalEventsStepProps {
  data: WizardFormData;
  onChange: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
  editPersonId?: string | null;
  personDisplayName?: string;
}

const VitalEventsStep: React.FC<VitalEventsStepProps> = ({ data, onChange, editPersonId, personDisplayName }) => {
  const { openModal } = useModal();
  const [marriageChips, setMarriageChips] = useState<string[]>([]);

  const handleToggle = (tag: string) => {
    const exists = data.additionalEvents.find((e) => e.type === tag);
    if (exists) {
      onChange(
        'additionalEvents',
        data.additionalEvents.filter((e) => e.type !== tag),
      );
    } else {
      onChange('additionalEvents', [
        ...data.additionalEvents,
        { type: tag, date: '', place: '', description: '' },
      ]);
    }
  };

  const handleEventChange = (index: number, field: keyof EventData, value: string) => {
    const updated = [...data.additionalEvents];
    updated[index] = { ...updated[index], [field]: value };
    onChange('additionalEvents', updated);
  };

  const handleRemoveEvent = (tag: string) => {
    onChange(
      'additionalEvents',
      data.additionalEvents.filter((e) => e.type !== tag),
    );
  };

  const handleAddMarriage = async () => {
    if (!editPersonId) return;
    const result = await openModal('MarriageEditor', {
      personId: editPersonId,
      personName: personDisplayName ?? 'this person',
      onSaved: () => {/* parent refreshes after wizard complete */},
    });
    if (result.action === 'created') {
      const { spouseName, marriageDate } = result.entity as { spouseName: string | null; marriageDate: string | null };
      const parts = ['Married', spouseName, marriageDate].filter(Boolean);
      setMarriageChips((prev) => [...prev, parts.join(' · ')]);
    }
  };

  return (
    <div className={styles.section}>
      {/* Fixed events: Birth and Death */}
      <div className={styles.fixedEvents}>
        <div className={styles.eventBlock}>
          <h4 className={styles.eventBlockTitle}>Birth</h4>
          <div className={styles.eventFields}>
            <FormGroup>
              <Label>Date</Label>
              <Input
                placeholder="e.g. 1 Jan 1900 or ABT 1900"
                value={data.birthDate}
                onChange={(e) => onChange('birthDate', e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Place</Label>
              <Input
                placeholder="City, State, Country"
                value={data.birthPlace}
                onChange={(e) => onChange('birthPlace', e.target.value)}
              />
            </FormGroup>
          </div>
        </div>

        <div className={styles.eventBlock}>
          <h4 className={styles.eventBlockTitle}>Death</h4>
          <div className={styles.eventFields}>
            <FormGroup>
              <Label>Date</Label>
              <Input
                placeholder="e.g. 15 Mar 1980"
                value={data.deathDate}
                onChange={(e) => onChange('deathDate', e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Place</Label>
              <Input
                placeholder="City, State, Country"
                value={data.deathPlace}
                onChange={(e) => onChange('deathPlace', e.target.value)}
              />
            </FormGroup>
          </div>
        </div>
      </div>

      {/* Additional events */}
      <div className={styles.divider} />
      <h4 className={styles.sectionTitle}>Additional Events</h4>
      <TagPicker
        availableTags={ADDITIONAL_EVENT_TYPES}
        selectedEvents={data.additionalEvents}
        onToggle={handleToggle}
        onEventChange={handleEventChange}
        onRemoveEvent={handleRemoveEvent}
      />
      <div className={styles.marriageSection}>
        <div className={styles.marriageSectionHeader}>
          <h4 className={styles.sectionTitle}>Marriage</h4>
          <button
            type="button"
            className={styles.addMarriageBtn}
            onClick={handleAddMarriage}
            disabled={!editPersonId}
            title={!editPersonId ? 'Save the person first, then add the marriage' : undefined}
          >
            + Add Marriage
          </button>
        </div>
        {marriageChips.map((chip, i) => (
          <span key={i} className={styles.marriageChip}>
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
};

export default VitalEventsStep;

import React from 'react';
import { FormGroup, Label, Input } from '@/components/Form';
import TagPicker from '@/components/TagPicker/TagPicker';
import PlaceInput from '@/components/entity-pickers/PlaceInput';
import type { EventData } from '@/components/TagPicker/TagPicker';
import type { WizardFormData } from '@/hooks/usePersonWizard';
import styles from './VitalEventsStep.module.css';
import { DATE_INPUT_HINT } from '@/utils/dateInput';

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
}

const VitalEventsStep: React.FC<VitalEventsStepProps> = ({ data, onChange }) => {

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
                placeholder={DATE_INPUT_HINT}
                value={data.birthDate}
                onChange={(e) => onChange('birthDate', e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Place</Label>
              <PlaceInput
                placeholder="City, State, Country"
                value={data.birthPlace}
                onChange={(value) => onChange('birthPlace', value)}
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
                placeholder={DATE_INPUT_HINT}
                value={data.deathDate}
                onChange={(e) => onChange('deathDate', e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Place</Label>
              <PlaceInput
                placeholder="City, State, Country"
                value={data.deathPlace}
                onChange={(value) => onChange('deathPlace', value)}
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
      <p className={styles.marriageHint}>
        Marriages are added from the person&rsquo;s editor once they exist, since a
        marriage links two people. Finish adding this person, then open them from
        the tree to record it.
      </p>
    </div>
  );
};

export default VitalEventsStep;

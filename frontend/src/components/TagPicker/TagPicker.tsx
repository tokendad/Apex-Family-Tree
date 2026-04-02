import React from 'react';
import Tag from '@/components/Tag/Tag';
import Input from '@/components/Form/Input';
import Label from '@/components/Form/Label';
import FormGroup from '@/components/Form/FormGroup';
import styles from './TagPicker.module.css';

export interface EventData {
  type: string;
  date: string;
  place: string;
  description: string;
}

interface TagPickerProps {
  availableTags: string[];
  selectedEvents: EventData[];
  onToggle: (tag: string) => void;
  onEventChange: (index: number, field: keyof EventData, value: string) => void;
  onRemoveEvent: (tag: string) => void;
  className?: string;
}

const TagPicker: React.FC<TagPickerProps> = ({
  availableTags,
  selectedEvents,
  onToggle,
  onEventChange,
  onRemoveEvent,
  className,
}) => {
  const selectedTypes = new Set(selectedEvents.map((e) => e.type));

  return (
    <div className={className}>
      <div className={styles.grid}>
        {availableTags.map((tag) => (
          <Tag
            key={tag}
            selected={selectedTypes.has(tag)}
            onClick={() => onToggle(tag)}
          >
            {tag}
          </Tag>
        ))}
      </div>

      {selectedEvents.map((event, idx) => (
        <div key={event.type} className={styles.eventForm}>
          <div className={styles.eventHeader}>
            <span className={styles.eventTitle}>{event.type}</span>
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => onRemoveEvent(event.type)}
              aria-label={`Remove ${event.type}`}
            >
              ✕
            </button>
          </div>
          <div className={styles.eventFields}>
            <FormGroup>
              <Label>Date</Label>
              <Input
                placeholder="e.g. 1 Jan 1900 or ABT 1900"
                value={event.date}
                onChange={(e) => onEventChange(idx, 'date', e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Place</Label>
              <Input
                placeholder="City, State, Country"
                value={event.place}
                onChange={(e) => onEventChange(idx, 'place', e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Description</Label>
              <Input
                placeholder="Optional description"
                value={event.description}
                onChange={(e) => onEventChange(idx, 'description', e.target.value)}
              />
            </FormGroup>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TagPicker;

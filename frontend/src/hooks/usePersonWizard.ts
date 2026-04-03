import { useState, useCallback } from 'react';
import type { EventData } from '@/components/TagPicker/TagPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';

export interface SpouseEntry {
  person: PersonResult;
  marriageDate: string;
}

export interface SourceEntry {
  title: string;
  page: string;
  quality: string;
}

export interface WizardFormData {
  // Personal info (step 1)
  photoFile: File | null;
  photoPreviewUrl: string;
  prefix: string;
  givenName: string;
  surname: string;
  suffix: string;
  nameType: string;
  sex: 'M' | 'F' | 'X' | 'U';
  isLiving: boolean;
  isPrivate: boolean;

  // Vital events (step 2)
  birthDate: string;
  birthPlace: string;
  deathDate: string;
  deathPlace: string;
  additionalEvents: EventData[];

  // Relationships (step 3)
  parents: PersonResult[];
  spouses: SpouseEntry[];

  // Media & notes (step 4)
  mediaFiles: File[];
  notes: string;
  sources: SourceEntry[];
}

export interface PreLinkedRelationship {
  type: 'parent' | 'spouse' | 'child';
  personId: string;
}

interface UsePersonWizardOptions {
  editPersonId?: string | null;
  preLink?: PreLinkedRelationship | null;
  onComplete?: () => void;
}

const INITIAL_DATA: WizardFormData = {
  photoFile: null,
  photoPreviewUrl: '',
  prefix: '',
  givenName: '',
  surname: '',
  suffix: '',
  nameType: 'birth',
  sex: 'U',
  isLiving: true,
  isPrivate: false,
  birthDate: '',
  birthPlace: '',
  deathDate: '',
  deathPlace: '',
  additionalEvents: [],
  parents: [],
  spouses: [],
  mediaFiles: [],
  notes: '',
  sources: [],
};

const TOTAL_STEPS = 4;

export function usePersonWizard(options: UsePersonWizardOptions = {}) {
  const { editPersonId = null, preLink = null, onComplete } = options;
  const isEditMode = !!editPersonId;

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardFormData>({ ...INITIAL_DATA });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = useCallback(
    <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => {
      setData((prev) => ({ ...prev, [field]: value }));
      setIsDirty(true);
    },
    [],
  );

  const validateStep = useCallback(
    (s: number): boolean => {
      const errs: Record<string, string> = {};
      if (s === 1) {
        if (!data.givenName.trim() && !data.surname.trim()) {
          errs.givenName = 'At least a given name or surname is required';
        }
      }
      setErrors(errs);
      return Object.keys(errs).length === 0;
    },
    [data],
  );

  const goNext = useCallback(() => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }, [step, validateStep]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(1, s - 1));
  }, []);

  const goToStep = useCallback(
    (s: number) => {
      if (s < step) setStep(s);
    },
    [step],
  );

  // Load existing person for edit mode
  const loadPerson = useCallback(
    async (personId: string) => {
      try {
        const res = await fetch(`/api/v1/people/${personId}`, { credentials: 'include' });
        if (!res.ok) return;
        const person = await res.json();

        setData((prev) => ({
          ...prev,
          givenName: person.given_name ?? '',
          surname: person.surname ?? '',
          prefix: person.prefix ?? '',
          suffix: person.suffix ?? '',
          nameType: person.name_type ?? 'birth',
          sex: person.sex ?? 'U',
          isLiving: person.is_living ?? true,
          isPrivate: person.is_private ?? false,
          photoPreviewUrl: person.photo_url ?? '',
          birthDate: person.birth_date ?? '',
          birthPlace: person.birth_place ?? '',
          deathDate: person.death_date ?? '',
          deathPlace: person.death_place ?? '',
          notes: person.notes ?? '',
        }));
      } catch {
        // Silently fail — user can fill in manually
      }
    },
    [],
  );

  const submit = useCallback(async () => {
    if (!validateStep(step)) return;

    setIsSaving(true);
    try {
      // 1. Create or update person
      const personPayload = {
        given_name: data.givenName || null,
        surname: data.surname || null,
        prefix: data.prefix || null,
        suffix: data.suffix || null,
        sex: data.sex,
        is_living: data.isLiving,
        is_private: data.isPrivate,
      };

      let personId = editPersonId;

      if (isEditMode && personId) {
        await fetch(`/api/v1/people/${personId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(personPayload),
        });
      } else {
        const res = await fetch('/api/v1/people', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(personPayload),
        });
        if (res.ok) {
          const created = await res.json();
          personId = created.id;
        }
      }

      if (!personId) throw new Error('Failed to create/update person');

      // 2. Create name record
      if (data.givenName || data.surname) {
        await fetch(`/api/v1/people/${personId}/names`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            given_name: data.givenName || null,
            surname: data.surname || null,
            prefix: data.prefix || null,
            suffix: data.suffix || null,
            name_type: data.nameType,
          }),
        });
      }

      // 3. Create events
      const events: Array<{ event_type: string; event_date: string | null; event_place: string | null; description?: string | null }> = [];
      if (data.birthDate || data.birthPlace) {
        events.push({ event_type: 'birth', event_date: data.birthDate || null, event_place: data.birthPlace || null });
      }
      if (data.deathDate || data.deathPlace) {
        events.push({ event_type: 'death', event_date: data.deathDate || null, event_place: data.deathPlace || null });
      }
      for (const evt of data.additionalEvents) {
        if (evt.date || evt.place || evt.description) {
          events.push({
            event_type: evt.type.toLowerCase().replace(/\s+/g, '_'),
            event_date: evt.date || null,
            event_place: evt.place || null,
            description: evt.description || null,
          });
        }
      }
      for (const evt of events) {
        await fetch(`/api/v1/events/people/${personId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(evt),
        });
      }

      // 4. Create/link relationships (families)
      for (const parent of data.parents) {
        // Create a family with the parent as spouse1, then add the new person as a child member
        const famRes = await fetch('/api/v1/families', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ spouse1_id: parent.id }),
        });
        if (famRes.ok) {
          const family = await famRes.json();
          await fetch(`/api/v1/families/${family.id}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ person_id: personId, role: 'child' }),
          });
        }
      }

      for (const spouse of data.spouses) {
        await fetch('/api/v1/families', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            spouse1_id: personId,
            spouse2_id: spouse.person.id,
            marriage_date: spouse.marriageDate || null,
          }),
        });
      }

      // Handle pre-linked relationship
      if (preLink && personId) {
        if (preLink.type === 'parent') {
          // New person is a parent — create family with them as spouse1, add pre-linked person as child
          const famRes = await fetch('/api/v1/families', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ spouse1_id: personId }),
          });
          if (famRes.ok) {
            const family = await famRes.json();
            await fetch(`/api/v1/families/${family.id}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ person_id: preLink.personId, role: 'child' }),
            });
          }
        } else if (preLink.type === 'spouse') {
          await fetch('/api/v1/families', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              spouse1_id: preLink.personId,
              spouse2_id: personId,
            }),
          });
        } else if (preLink.type === 'child') {
          // New person is a child — create family with pre-linked person as spouse1, add new person as child
          const famRes = await fetch('/api/v1/families', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ spouse1_id: preLink.personId }),
          });
          if (famRes.ok) {
            const family = await famRes.json();
            await fetch(`/api/v1/families/${family.id}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ person_id: personId, role: 'child' }),
            });
          }
        }
      }

      // 5. Upload and link media files
      for (const file of data.mediaFiles) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch('/api/v1/media/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        if (uploadRes.ok) {
          const media = await uploadRes.json();
          await fetch(`/api/v1/media/people/${personId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ media_id: media.id, is_primary: false }),
          });
        }
      }

      // 6. Upload and link primary photo
      if (data.photoFile) {
        const formData = new FormData();
        formData.append('file', data.photoFile);
        const uploadRes = await fetch('/api/v1/media/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        if (uploadRes.ok) {
          const media = await uploadRes.json();
          await fetch(`/api/v1/media/people/${personId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ media_id: media.id, is_primary: true }),
          });
        }
      }

      // 7. Create sources and citations
      for (const source of data.sources) {
        if (source.title) {
          const sourceRes = await fetch('/api/v1/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ title: source.title }),
          });
          if (sourceRes.ok) {
            const created = await sourceRes.json();
            await fetch(`/api/v1/sources/${created.id}/citations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                person_id: personId,
                page: source.page || null,
                quality: source.quality || null,
              }),
            });
          }
        }
      }

      setIsDirty(false);
      onComplete?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setErrors({ submit: msg });
    } finally {
      setIsSaving(false);
    }
  }, [step, data, editPersonId, isEditMode, preLink, onComplete, validateStep]);

  const reset = useCallback(() => {
    setData({ ...INITIAL_DATA });
    setStep(1);
    setIsDirty(false);
    setErrors({});
  }, []);

  return {
    step,
    totalSteps: TOTAL_STEPS,
    data,
    isDirty,
    isSaving,
    errors,
    isEditMode,
    updateField,
    goNext,
    goBack,
    goToStep,
    submit,
    reset,
    loadPerson,
  };
}

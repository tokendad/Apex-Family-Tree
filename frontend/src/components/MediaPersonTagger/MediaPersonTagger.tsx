import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import PersonSearch, { type PersonResult } from '@/components/PersonSearch/PersonSearch';
import { getPersonDisplayName } from '@/utils/entityDisplay';
import styles from './MediaPersonTagger.module.css';

interface MediaRegion {
  id: string;
  media_id: string;
  person_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  person_given_name: string | null;
  person_middle_name?: string | null;
  person_surname: string | null;
  person_display_name?: string | null;
  person_birth_date: string | null;
  person_death_date: string | null;
  person_photo_url: string | null;
}

interface MediaRegionResponse {
  regions?: MediaRegion[];
  region?: MediaRegion;
}

interface MediaPersonTaggerProps {
  mediaId: string;
  mediaSrc: string;
  canEdit: boolean;
  onChanged?: () => Promise<void> | void;
}

interface DraftRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MovingRegion {
  id: string;
  start: { x: number; y: number };
  original: DraftRect;
}

type ResizingRegion = MovingRegion;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundCoord(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clampRegionRect(rect: DraftRect): DraftRect {
  const width = Math.min(1, Math.max(0.02, rect.width));
  const height = Math.min(1, Math.max(0.02, rect.height));
  return {
    x: roundCoord(Math.min(Math.max(rect.x, 0), 1 - width)),
    y: roundCoord(Math.min(Math.max(rect.y, 0), 1 - height)),
    width: roundCoord(width),
    height: roundCoord(height),
  };
}

function toDraftRect(start: { x: number; y: number }, current: { x: number; y: number }): DraftRect {
  const x1 = Math.min(start.x, current.x);
  const y1 = Math.min(start.y, current.y);
  const x2 = Math.max(start.x, current.x);
  const y2 = Math.max(start.y, current.y);
  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

interface RegionView extends MediaRegion {
  left: string;
  top: string;
  widthCss: string;
  heightCss: string;
  displayName: string;
}

function createdPersonToResult(person: {
  id: string;
  displayName?: string | null;
  display_name?: string | null;
  primary_name?: {
    given_name?: string | null;
    middle_name?: string | null;
    surname?: string | null;
  } | null;
  names?: Array<{
    given_name?: string | null;
    middle_name?: string | null;
    surname?: string | null;
    is_primary?: number;
  }>;
}): PersonResult {
  const primaryName = person.primary_name ?? person.names?.find((name) => name.is_primary) ?? person.names?.[0];
  return {
    id: person.id,
    displayName: person.displayName ?? null,
    display_name: person.display_name ?? null,
    given_name: primaryName?.given_name ?? null,
    middle_name: primaryName?.middle_name ?? null,
    surname: primaryName?.surname ?? null,
    birth_date: null,
    death_date: null,
    photo_url: null,
  };
}

export default function MediaPersonTagger({
  mediaId,
  mediaSrc,
  canEdit,
  onChanged,
}: MediaPersonTaggerProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const movingRegionRef = useRef<MovingRegion | null>(null);
  const resizingRegionRef = useRef<ResizingRegion | null>(null);

  const [regions, setRegions] = useState<MediaRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taggingEnabled, setTaggingEnabled] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  const [regionEdits, setRegionEdits] = useState<Record<string, DraftRect>>({});
  const regionEditsRef = useRef<Record<string, DraftRect>>({});
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [showCreatePerson, setShowCreatePerson] = useState(false);
  const [newGivenName, setNewGivenName] = useState('');
  const [newSurname, setNewSurname] = useState('');
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  );

  const loadRegions = useCallback(async () => {
    setLoading(true);
    setError('');
    const controller = new AbortController();
    try {
      const res = await fetch(`/api/v1/media/${mediaId}/regions`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load tags (${res.status})`);
      const data = (await res.json()) as MediaRegionResponse;
      setRegions(data.regions ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load tags');
      setRegions([]);
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, [mediaId]);

  useEffect(() => {
    void loadRegions();
  }, [loadRegions]);

  useEffect(() => {
    setDraftRect(null);
    setRegionEdits({});
    regionEditsRef.current = {};
    setSelectedRegionId(null);
    setSelectedPerson(null);
    setShowCreatePerson(false);
    setNewGivenName('');
    setNewSurname('');
    setTaggingEnabled(false);
    setIsDrawing(false);
    movingRegionRef.current = null;
    resizingRegionRef.current = null;
  }, [mediaId]);

  const pointerPosition = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return null;

    const rect = stage.getBoundingClientRect();
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    return { x, y };
  };

  const startDrawing = (clientX: number, clientY: number) => {
    if (!canEdit || !taggingEnabled) return;
    const position = pointerPosition(clientX, clientY);
    if (!position) return;
    pointerStartRef.current = position;
    setIsDrawing(true);
    setSelectedRegionId(null);
    setSelectedPerson(null);
    setShowCreatePerson(false);
    setDraftRect({ x: position.x, y: position.y, width: 0, height: 0 });
  };

  const updateDrawing = (clientX: number, clientY: number) => {
    if (!isDrawing || !pointerStartRef.current) return;
    const position = pointerPosition(clientX, clientY);
    if (!position) return;
    setDraftRect(toDraftRect(pointerStartRef.current, position));
  };

  const finishDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    pointerStartRef.current = null;
    setDraftRect((current) => {
      if (!current || current.width < 0.02 || current.height < 0.02) {
        return null;
      }
      return current;
    });
  };

  const selectRegion = (region: MediaRegion) => {
    setSelectedRegionId(region.id);
    setDraftRect(null);
    setShowCreatePerson(false);
    setSelectedPerson({
      id: region.person_id,
      displayName: region.person_display_name ?? null,
      given_name: region.person_given_name,
      middle_name: region.person_middle_name ?? null,
      surname: region.person_surname,
      birth_date: region.person_birth_date,
      death_date: region.person_death_date,
      photo_url: region.person_photo_url,
    });
  };

  const regionRect = (region: MediaRegion): DraftRect => regionEdits[region.id] ?? {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  };

  const updateRegionEdit = (regionId: string, rect: DraftRect) => {
    regionEditsRef.current = {
      ...regionEditsRef.current,
      [regionId]: rect,
    };
    setRegionEdits(regionEditsRef.current);
  };

  const moveRegion = (clientX: number, clientY: number) => {
    const moving = movingRegionRef.current;
    if (!moving) return;
    const position = pointerPosition(clientX, clientY);
    if (!position) return;

    const nextRect = clampRegionRect({
      ...moving.original,
      x: moving.original.x + position.x - moving.start.x,
      y: moving.original.y + position.y - moving.start.y,
    });
    updateRegionEdit(moving.id, nextRect);
  };

  const resizeRegion = (clientX: number, clientY: number) => {
    const resizing = resizingRegionRef.current;
    if (!resizing) return;
    const position = pointerPosition(clientX, clientY);
    if (!position) return;

    const nextRect = clampRegionRect({
      ...resizing.original,
      width: resizing.original.width + position.x - resizing.start.x,
      height: resizing.original.height + position.y - resizing.start.y,
    });
    updateRegionEdit(resizing.id, nextRect);
  };

  const finishMoveOrResize = () => {
    movingRegionRef.current = null;
    resizingRegionRef.current = null;
  };

  const handleSave = async () => {
    if (!selectedPerson?.id) return;

    setSaving(true);
    setError('');
    try {
      if (selectedRegion) {
        const editedRect = regionEditsRef.current[selectedRegion.id];
        const res = await fetch(`/api/v1/media/${mediaId}/regions/${selectedRegion.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            person_id: selectedPerson.id,
            ...(editedRect ? {
              x: editedRect.x,
              y: editedRect.y,
              width: editedRect.width,
              height: editedRect.height,
            } : {}),
          }),
        });
        if (!res.ok) throw new Error(`Failed to update tag (${res.status})`);
      } else if (draftRect) {
        const res = await fetch(`/api/v1/media/${mediaId}/regions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            person_id: selectedPerson.id,
            x: draftRect.x,
            y: draftRect.y,
            width: draftRect.width,
            height: draftRect.height,
          }),
        });
        if (!res.ok) throw new Error(`Failed to create tag (${res.status})`);
      } else {
        return;
      }

      setDraftRect(null);
      setRegionEdits({});
      regionEditsRef.current = {};
      setSelectedRegionId(null);
      setSelectedPerson(null);
      await loadRegions();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tag');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePerson = async () => {
    const givenName = newGivenName.trim();
    const surname = newSurname.trim();
    if (!givenName && !surname) {
      setError('Enter at least a given name or surname');
      return;
    }

    setCreatingPerson(true);
    setError('');
    try {
      const res = await fetch('/api/v1/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sex: 'U',
          is_living: 1,
          is_private: 0,
          names: [
            {
              name_type: 'birth',
              given_name: givenName || null,
              surname: surname || null,
              is_primary: 1,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Failed to create person (${res.status})`);

      const person = createdPersonToResult(await res.json());
      setSelectedPerson(person);
      setShowCreatePerson(false);
      setNewGivenName('');
      setNewSurname('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create person');
    } finally {
      setCreatingPerson(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRegion) return;

    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/media/${mediaId}/regions/${selectedRegion.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete tag (${res.status})`);

      setSelectedRegionId(null);
      setSelectedPerson(null);
      setRegionEdits({});
      regionEditsRef.current = {};
      await loadRegions();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
    } finally {
      setDeleting(false);
    }
  };

  const displayedRegions: RegionView[] = regions.map((region) => ({
    ...region,
    left: `${regionRect(region).x * 100}%`,
    top: `${regionRect(region).y * 100}%`,
    widthCss: `${regionRect(region).width * 100}%`,
    heightCss: `${regionRect(region).height * 100}%`,
    displayName: getPersonDisplayName({
      displayName: region.person_display_name,
      given_name: region.person_given_name,
      middle_name: region.person_middle_name,
      surname: region.person_surname,
    }),
  }));

  return (
    <section className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div>
          <h3 className={styles.title}>Photo Tags</h3>
          <p className={styles.subtitle}>
            {canEdit
              ? 'Turn on tagging, draw a box on the photo, and assign it to an existing person.'
              : 'Existing photo tags are shown here.'}
          </p>
        </div>
        {canEdit && (
          <Button
            variant={taggingEnabled ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => {
              setTaggingEnabled((value) => !value);
              setDraftRect(null);
              setSelectedRegionId(null);
              setSelectedPerson(null);
              setShowCreatePerson(false);
              finishMoveOrResize();
            }}
          >
            {taggingEnabled ? 'Tagging On' : 'Tag People'}
          </Button>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div
        ref={stageRef}
        className={[
          styles.stage,
          taggingEnabled ? styles.stageActive : '',
          canEdit ? styles.stageEditable : '',
        ].filter(Boolean).join(' ')}
        onPointerDown={(e) => {
          if (!canEdit || !taggingEnabled) return;
          if (e.target instanceof Element && e.target.closest('[role="button"], button')) return;
          startDrawing(e.clientX, e.clientY);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!isDrawing) return;
          updateDrawing(e.clientX, e.clientY);
        }}
        onPointerUp={() => finishDrawing()}
        onPointerLeave={() => finishDrawing()}
      >
        <img
          ref={imageRef}
          className={styles.image}
          src={mediaSrc}
          alt="Tagged media preview"
          draggable={false}
        />

        <div className={styles.overlay}>
          {displayedRegions.map((region) => (
            <div
              key={region.id}
              role="button"
              tabIndex={0}
              className={[
                styles.region,
                canEdit && taggingEnabled ? styles.regionEditable : '',
                selectedRegion?.id === region.id ? styles.regionSelected : '',
              ].filter(Boolean).join(' ')}
              style={{
                left: region.left,
                top: region.top,
                width: region.widthCss,
                height: region.heightCss,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                selectRegion(region);
                if (!canEdit || !taggingEnabled) return;
                const position = pointerPosition(e.clientX, e.clientY);
                if (!position) return;
                movingRegionRef.current = {
                  id: region.id,
                  start: position,
                  original: regionRect(region),
                };
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (movingRegionRef.current?.id !== region.id) return;
                e.stopPropagation();
                moveRegion(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                if (movingRegionRef.current?.id !== region.id) return;
                e.stopPropagation();
                finishMoveOrResize();
              }}
              onPointerCancel={finishMoveOrResize}
              onClick={(e) => {
                e.stopPropagation();
                selectRegion(region);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectRegion(region);
                }
              }}
              aria-label={`Tag for ${region.displayName}`}
            >
              <span className={styles.regionLabel}>{region.displayName}</span>
              {canEdit && taggingEnabled && selectedRegion?.id === region.id && (
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.resizeHandle}
                  aria-label={`Resize tag ${region.displayName}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const position = pointerPosition(e.clientX, e.clientY);
                    if (!position) return;
                    resizingRegionRef.current = {
                      id: region.id,
                      start: position,
                      original: regionRect(region),
                    };
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (resizingRegionRef.current?.id !== region.id) return;
                    e.stopPropagation();
                    resizeRegion(e.clientX, e.clientY);
                  }}
                  onPointerUp={(e) => {
                    if (resizingRegionRef.current?.id !== region.id) return;
                    e.stopPropagation();
                    finishMoveOrResize();
                  }}
                  onPointerCancel={finishMoveOrResize}
                />
              )}
            </div>
          ))}

          {draftRect && (
            <div
              className={styles.draft}
              style={{
                left: `${draftRect.x * 100}%`,
                top: `${draftRect.y * 100}%`,
                width: `${draftRect.width * 100}%`,
                height: `${draftRect.height * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      <div className={styles.editorPanel}>
        {draftRect && !selectedRegion && (
          <div className={styles.editingNotice}>New tag ready. Pick a person to save it.</div>
        )}

        {selectedRegion ? (
          <>
            <div className={styles.regionDetails}>
              <div className={styles.regionHeading}>{getPersonDisplayName({
                displayName: selectedRegion.person_display_name,
                given_name: selectedRegion.person_given_name,
                middle_name: selectedRegion.person_middle_name,
                surname: selectedRegion.person_surname,
              })}</div>
              <div className={styles.regionMeta}>Existing tag</div>
            </div>
            {canEdit && (
              <PersonSearch
                onSelect={(person) => {
                  setSelectedPerson(person);
                  setShowCreatePerson(false);
                }}
                selectedPersons={selectedPerson?.id ? [selectedPerson] : []}
                placeholder="Search existing people..."
              />
            )}
            <div className={styles.actionsRow}>
              {canEdit && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  disabled={!selectedPerson?.id || saving}
                >
                  Save Changes
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  loading={deleting}
                  disabled={deleting}
                >
                  Delete Tag
                </Button>
              )}
            </div>
          </>
        ) : draftRect ? (
          <>
            <div className={styles.regionDetails}>
              <div className={styles.regionHeading}>New Tag</div>
              <div className={styles.regionMeta}>
                {Math.round(draftRect.width * 100)}% x {Math.round(draftRect.height * 100)}%
              </div>
            </div>
            {canEdit && (
              <PersonSearch
                onSelect={(person) => {
                  setSelectedPerson(person);
                  setShowCreatePerson(false);
                }}
                selectedPersons={selectedPerson?.id ? [selectedPerson] : []}
                placeholder="Search existing people..."
              />
            )}
            {canEdit && (
              <div className={styles.createPersonBlock}>
                {!showCreatePerson ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreatePerson(true)}
                  >
                    Create new person
                  </Button>
                ) : (
                  <div className={styles.createPersonForm}>
                    <label className={styles.fieldLabel}>
                      Given name
                      <Input
                        value={newGivenName}
                        onChange={(e) => setNewGivenName(e.target.value)}
                      />
                    </label>
                    <label className={styles.fieldLabel}>
                      Surname
                      <Input
                        value={newSurname}
                        onChange={(e) => setNewSurname(e.target.value)}
                      />
                    </label>
                    <div className={styles.actionsRow}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleCreatePerson}
                        loading={creatingPerson}
                        disabled={creatingPerson || (!newGivenName.trim() && !newSurname.trim())}
                      >
                        Create Person
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowCreatePerson(false);
                          setNewGivenName('');
                          setNewSurname('');
                        }}
                        disabled={creatingPerson}
                      >
                        Cancel Create
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className={styles.actionsRow}>
              {canEdit && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  disabled={!selectedPerson?.id || saving}
                >
                  Save Tag
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraftRect(null);
                    setSelectedPerson(null);
                    setShowCreatePerson(false);
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              )}
            </div>
          </>
        ) : loading ? (
          <div className={styles.empty}>Loading tags...</div>
        ) : regions.length === 0 ? (
          <div className={styles.empty}>No tags yet.</div>
        ) : (
          <div className={styles.empty}>Select a tag to edit or delete it.</div>
        )}
      </div>
    </section>
  );
}

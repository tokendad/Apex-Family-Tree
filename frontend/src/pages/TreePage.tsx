import React, { useState, useCallback, useEffect, useRef } from 'react';
import styles from './TreePage.module.css';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import TreeCanvas from '@/components/TreeCanvas/TreeCanvas';
import CanvasToolbar from '@/components/CanvasToolbar/CanvasToolbar';
import CanvasLegend from '@/components/CanvasLegend/CanvasLegend';
import ContextMenu from '@/components/ContextMenu/ContextMenu';
import DetailPanel from '@/components/DetailPanel/DetailPanel';
import WizardModal from '@/components/WizardModal/WizardModal';
import StepIndicator, { WIZARD_STEPS } from '@/components/StepIndicator/StepIndicator';
import PersonalInfoStep from '@/components/WizardSteps/PersonalInfoStep';
import VitalEventsStep from '@/components/WizardSteps/VitalEventsStep';
import RelationshipsStep from '@/components/WizardSteps/RelationshipsStep';
import MediaNotesStep from '@/components/WizardSteps/MediaNotesStep';
import { useCanvasStore } from '@/stores/canvasStore';
import { useTreeData } from '@/hooks/useTreeData';
import { usePersonWizard } from '@/hooks/usePersonWizard';
import { useSearchStore, hasActiveFilters, filtersToParams } from '@/stores/searchStore';
import type { PreLinkedRelationship } from '@/hooks/usePersonWizard';

type TreeFilter = 'all' | 'unconnected-people' | 'unconnected-trees';

const TreePage: React.FC = () => {
  const { refetch } = useTreeData();
  const [treeFilter, setTreeFilter] = useState<TreeFilter>('all');
  const { selectedPersonId, setHighlightedPersonIds } = useCanvasStore();
  const searchFilters = useSearchStore();
  const setTotalCount = useSearchStore((s) => s.setTotalCount);
  const filtersActive = hasActiveFilters(searchFilters);
  const highlightDebounce = useRef<ReturnType<typeof setTimeout>>();

  // Highlight matching tree nodes when search is active
  useEffect(() => {
    if (highlightDebounce.current) clearTimeout(highlightDebounce.current);

    if (!filtersActive) {
      setHighlightedPersonIds(new Set());
      setTotalCount(null);
      return;
    }

    highlightDebounce.current = setTimeout(async () => {
      try {
        const params = filtersToParams(useSearchStore.getState());
        params.set('limit', '200');
        const res = await fetch(`/api/v1/people?${params.toString()}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          const items = data.data ?? data.people ?? [];
          const ids = new Set<string>(items.map((p: { id: string }) => p.id));
          setHighlightedPersonIds(ids);
          if (data.total_count !== undefined) {
            setTotalCount(data.total_count);
          }
        }
      } catch {
        // Silently fail — highlighting is non-critical
      }
    }, 400);

    return () => {
      if (highlightDebounce.current) clearTimeout(highlightDebounce.current);
    };
  }, [
    searchFilters.globalQuery, searchFilters.firstName, searchFilters.lastName,
    searchFilters.nameMatchType, searchFilters.initial, searchFilters.sex,
    searchFilters.dateMode, searchFilters.dateYear, searchFilters.dateYearTo,
    searchFilters.dateApplyToBirth, searchFilters.dateApplyToDeath, searchFilters.dateApplyToMarriage,
    searchFilters.dateQualifier,
    searchFilters.placeCountry, searchFilters.placeState, searchFilters.placeCity,
    searchFilters.hasPhoto, searchFilters.hasSources,
    searchFilters.hasMissingData, searchFilters.isLiving, searchFilters.relationshipType,
    filtersActive, setHighlightedPersonIds, setTotalCount,
  ]);

  // Clear highlights when leaving tree page
  useEffect(() => {
    return () => setHighlightedPersonIds(new Set());
  }, [setHighlightedPersonIds]);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [preLink, setPreLink] = useState<PreLinkedRelationship | null>(null);

  const handleWizardComplete = useCallback(() => {
    setWizardOpen(false);
    setEditPersonId(null);
    setPreLink(null);
    refetch();
  }, [refetch]);

  const wizard = usePersonWizard({
    editPersonId,
    preLink,
    onComplete: handleWizardComplete,
  });

  // Load person data when editing
  useEffect(() => {
    if (editPersonId && wizardOpen) {
      wizard.loadPerson(editPersonId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPersonId, wizardOpen]);

  const openCreateWizard = useCallback(() => {
    setEditPersonId(null);
    setPreLink(null);
    wizard.reset();
    setWizardOpen(true);
  }, [wizard]);

  const openEditWizard = useCallback(
    (personId: string) => {
      setEditPersonId(personId);
      setPreLink(null);
      wizard.reset();
      setWizardOpen(true);
    },
    [wizard],
  );

  const openPreLinkedWizard = useCallback(
    (personId: string, type: PreLinkedRelationship['type']) => {
      setEditPersonId(null);
      setPreLink({ type, personId });
      wizard.reset();
      setWizardOpen(true);
    },
    [wizard],
  );

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    setEditPersonId(null);
    setPreLink(null);
  }, []);

  const renderStep = () => {
    switch (wizard.step) {
      case 1:
        return <PersonalInfoStep data={wizard.data} onChange={wizard.updateField} />;
      case 2:
        return <VitalEventsStep data={wizard.data} onChange={wizard.updateField} />;
      case 3:
        return <RelationshipsStep data={wizard.data} onChange={wizard.updateField} />;
      case 4:
        return <MediaNotesStep data={wizard.data} onChange={wizard.updateField} />;
      default:
        return null;
    }
  };

  const wizardTitle = editPersonId ? 'Edit Person' : 'Add Person';

  return (
    <AppShell
      navbar={<Navbar />}
      sidebar={<Sidebar context="tree" />}
      detail={<DetailPanel />}
      showDetail={selectedPersonId !== null}
      context="tree"
    >
      <CanvasToolbar
        onAddPerson={openCreateWizard}
        treeFilter={treeFilter}
        onTreeFilterChange={setTreeFilter}
      />
      {treeFilter !== 'all' && (
        <div className={styles.filterBanner}>
          <span className={styles.filterBannerLabel}>
            Showing: {treeFilter === 'unconnected-people' ? 'Unconnected People' : 'Unconnected Trees'}
          </span>
          <button
            className={styles.filterBannerClear}
            onClick={() => setTreeFilter('all')}
          >
            Clear filter
          </button>
        </div>
      )}
      <TreeCanvas onAddPerson={openCreateWizard} />
      <CanvasLegend />
      <ContextMenu
        onEditPerson={openEditWizard}
        onAddParent={(id) => openPreLinkedWizard(id, 'parent')}
        onAddSpouse={(id) => openPreLinkedWizard(id, 'spouse')}
        onAddChild={(id) => openPreLinkedWizard(id, 'child')}
      />
      <WizardModal
        open={wizardOpen}
        title={wizardTitle}
        stepIndicator={
          <StepIndicator
            steps={WIZARD_STEPS}
            currentStep={wizard.step}
            onStepClick={wizard.goToStep}
          />
        }
        currentStep={wizard.step}
        totalSteps={wizard.totalSteps}
        isDirty={wizard.isDirty}
        isSaving={wizard.isSaving}
        onClose={closeWizard}
        onBack={wizard.goBack}
        onNext={wizard.goNext}
        onSave={wizard.submit}
      >
        {renderStep()}
      </WizardModal>
    </AppShell>
  );
};

export default TreePage;

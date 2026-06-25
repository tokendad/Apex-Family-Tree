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
import { layoutTree } from '@/utils/treeLayout';
import type { TreeNode, TreePerson, TreeFamily, ConnectorLine } from '@/stores/canvasStore';

type TreeFilter = 'all' | 'unconnected-people' | 'unconnected-trees';

const TreePage: React.FC = () => {
  const { refetch } = useTreeData();
  const [treeFilter, setTreeFilter] = useState<TreeFilter>('all');
  const { selectedPersonId, setHighlightedPersonIds } = useCanvasStore();
  const { nodes, isLoading, setNodes, setFamilies, setConnectors, setLoading, fitToScreen } = useCanvasStore();
  const searchFilters = useSearchStore();
  const setTotalCount = useSearchStore((s) => s.setTotalCount);
  const filtersActive = hasActiveFilters(searchFilters);
  const highlightDebounce = useRef<ReturnType<typeof setTimeout>>();
  const prevFilterRef = useRef<TreeFilter>('all');

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

  useEffect(() => {
    if (treeFilter === 'all') {
      if (prevFilterRef.current !== 'all') {
        void refetch();
      }
      prevFilterRef.current = 'all';
      return;
    }
    prevFilterRef.current = treeFilter;

    if (treeFilter === 'unconnected-people') {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/v1/tree/unconnected-people', { credentials: 'include' });
          if (!res.ok) throw new Error('Failed to fetch');
          const data = await res.json() as { people: TreePerson[] };

          const CARD_W = 260;
          const CARD_H = 180;
          const COLS = 4;
          const GAP_X = 20;
          const GAP_Y = 40;

          const nodes: TreeNode[] = data.people.map((person, i) => ({
            person,
            x: (i % COLS) * (CARD_W + GAP_X),
            y: Math.floor(i / COLS) * (CARD_H + GAP_Y),
            generation: 0,
          }));

          setNodes(nodes);
          setFamilies([]);
          setConnectors([]);
          fitToScreen(window.innerWidth, window.innerHeight);
        } catch {
          setNodes([]);
          setFamilies([]);
          setConnectors([]);
        } finally {
          setLoading(false);
        }
      })();
    }

    if (treeFilter === 'unconnected-trees') {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/v1/tree/unconnected-segments', { credentials: 'include' });
          if (!res.ok) throw new Error('Failed to fetch');
          const data = await res.json() as { segments: Array<{ persons: TreePerson[]; families: TreeFamily[] }> };

          if (data.segments.length === 0) {
            setNodes([]);
            setFamilies([]);
            setConnectors([]);
            setLoading(false);
            return;
          }

          const CARD_W = 260;
          const SEG_GAP = 120;

          let xOffset = 0;
          const allNodes: TreeNode[] = [];
          const allFamilies: TreeFamily[] = [];
          const allConnectors: ConnectorLine[] = [];

          for (const segment of data.segments) {
            const rootId = segment.persons[0]?.id ?? null;
            const { nodes, connectors } = layoutTree({
              persons: segment.persons,
              families: segment.families,
              rootPersonId: rootId,
            });

            if (nodes.length === 0) continue;

            // Compute true bounds (layoutTree centers, so minX can be negative)
            const minX = nodes.reduce((m, n) => Math.min(m, n.x), Infinity);
            const maxX = nodes.reduce((m, n) => Math.max(m, n.x), -Infinity);
            const segW = maxX - minX + CARD_W;
            const shift = xOffset - minX; // align left edge to xOffset

            const shiftedNodes = nodes.map(n => ({ ...n, x: n.x + shift }));
            const shiftedConnectors = connectors.map(c => ({
              ...c,
              from: { ...c.from, x: c.from.x + shift },
              to: { ...c.to, x: c.to.x + shift },
              midPoint: c.midPoint ? { ...c.midPoint, x: c.midPoint.x + shift } : undefined,
            }));

            allNodes.push(...shiftedNodes);
            allFamilies.push(...segment.families);
            allConnectors.push(...shiftedConnectors);

            xOffset += segW + SEG_GAP;
          }

          setNodes(allNodes);
          setFamilies(allFamilies);
          setConnectors(allConnectors);
          fitToScreen(window.innerWidth, window.innerHeight);
        } catch {
          setNodes([]);
          setFamilies([]);
          setConnectors([]);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [treeFilter, refetch, setNodes, setFamilies, setConnectors, setLoading, fitToScreen]);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [preLink, setPreLink] = useState<PreLinkedRelationship | null>(null);

  const handleWizardComplete = useCallback(() => {
    setWizardOpen(false);
    setEditPersonId(null);
    setPreLink(null);
    if (treeFilter === 'all') {
      refetch();
    }
  }, [refetch, treeFilter]);

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
      {treeFilter !== 'all' && nodes.length === 0 && !isLoading && (
        <div className={styles.emptyState}>
          {treeFilter === 'unconnected-people'
            ? 'No unconnected people found.'
            : 'No unconnected branches found — everyone is connected to the home person.'}
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

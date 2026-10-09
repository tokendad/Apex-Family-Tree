import React, { useEffect, useMemo, useRef } from 'react';
import { createChart } from 'family-chart';
import type { Datum } from 'family-chart';
import 'family-chart/styles/family-chart.css';
import type { TreeFamily, TreePerson } from '@/stores/canvasStore';
import { toFamilyChartData } from '@/utils/familyChartAdapter';
import styles from './FamilyChartTree.module.css';

export type FamilyChartOrientation = 'vertical' | 'horizontal';

interface FamilyChartTreeProps {
  persons: TreePerson[];
  families: TreeFamily[];
  mainPersonId: string | null;
  orientation?: FamilyChartOrientation;
  ancestryDepth?: number;
  progenyDepth?: number;
  /** Fired whenever the focused person changes (including the initial render). */
  onMainChange?: (personId: string) => void;
  /** Right-click on a person's card, with viewport coordinates for a menu. */
  onPersonContextMenu?: (personId: string, x: number, y: number) => void;
  /** Double-click on a person's card. */
  onPersonOpen?: (personId: string) => void;
}

/**
 * The person id behind a DOM node, or null if the node is not a person card.
 *
 * family-chart owns this subtree, so there are no React handlers to hang off.
 * It binds each card's datum with d3, which stores it on the element as
 * __data__ — that is the dependable route to the id. The library does write a
 * data-id attribute, but only onto a hidden decoy element and only as
 * Math.random(), so it is no use here.
 */
function personIdFromNode(target: EventTarget | null, known: Set<string>): string | null {
  if (!(target instanceof Element)) return null;
  const card = target.closest('.card_cont');
  if (!card) return null;
  const datum = (card as Element & { __data__?: { data?: { id?: unknown } } }).__data__;
  const id = datum?.data?.id;
  // Guards against family-chart's placeholder and "add relative" cards, which
  // carry ids that match nobody in the tree.
  return typeof id === 'string' && known.has(id) ? id : null;
}

/**
 * Prototype: renders the family tree with family-chart. The chart is centred
 * on one "main" person; clicking another card re-centres on that person.
 * Pan/zoom and card rendering are handled by the library (HTML cards).
 */
const FamilyChartTree: React.FC<FamilyChartTreeProps> = ({
  persons,
  families,
  mainPersonId,
  orientation = 'vertical',
  ancestryDepth = 3,
  progenyDepth = 3,
  onMainChange,
  onPersonContextMenu,
  onPersonOpen,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onMainChange);
  changeRef.current = onMainChange;
  // Held in a ref so the delegated listeners below can be attached once, for
  // the life of the container, rather than being torn down on every re-render.
  const handlersRef = useRef({ onPersonContextMenu, onPersonOpen });
  handlersRef.current = { onPersonContextMenu, onPersonOpen };

  const data = useMemo(() => toFamilyChartData(persons, families), [persons, families]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !mainPersonId || !data.some((d) => d.id === mainPersonId)) return;

    const chart = createChart(el, data)
      .setTransitionTime(400)
      .setCardXSpacing(250)
      .setCardYSpacing(150)
      .setAncestryDepth(ancestryDepth)
      .setProgenyDepth(progenyDepth)
      .setShowSiblingsOfMain(true)
      .setSingleParentEmptyCard(false);

    if (orientation === 'horizontal') chart.setOrientationHorizontal();
    else chart.setOrientationVertical();

    chart
      .setCardHtml()
      .setCardDisplay([
        (d: Datum) => `${d.data['first name'] ?? ''} ${d.data['last name'] ?? ''}`.trim(),
        (d: Datum) => (d.data.years as string) ?? '',
      ])
      .setCardDim({ w: 200, h: 70, text_x: 75, text_y: 15, img_w: 60, img_h: 60, img_x: 5, img_y: 5 })
      .setMiniTree(true)
      .setStyle('imageRect');

    chart.setAfterUpdate(() => {
      changeRef.current?.(chart.getMainDatum().id);
    });

    chart.updateMainId(mainPersonId);
    chart.updateTree({ initial: true });

    return () => {
      el.innerHTML = '';
    };
  }, [data, mainPersonId, orientation, ancestryDepth, progenyDepth]);

  // Delegated on the container, which survives the chart being rebuilt — the
  // chart effect clears the container's children but not the container itself.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const known = new Set(data.map((d) => d.id));

    const handleContextMenu = (event: MouseEvent) => {
      const id = personIdFromNode(event.target, known);
      if (!id) return;
      event.preventDefault();
      handlersRef.current.onPersonContextMenu?.(id, event.clientX, event.clientY);
    };

    const handleDoubleClick = (event: MouseEvent) => {
      const id = personIdFromNode(event.target, known);
      if (!id) return;
      event.preventDefault();
      handlersRef.current.onPersonOpen?.(id);
    };

    el.addEventListener('contextmenu', handleContextMenu);
    el.addEventListener('dblclick', handleDoubleClick);
    return () => {
      el.removeEventListener('contextmenu', handleContextMenu);
      el.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [data]);

  return <div ref={containerRef} className={`f3 ${styles.chart}`} />;
};

export default FamilyChartTree;

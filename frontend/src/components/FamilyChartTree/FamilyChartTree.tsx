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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onMainChange);
  changeRef.current = onMainChange;

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

  return <div ref={containerRef} className={`f3 ${styles.chart}`} />;
};

export default FamilyChartTree;

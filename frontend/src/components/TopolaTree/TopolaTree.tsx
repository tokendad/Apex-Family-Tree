import React, { useEffect, useMemo, useRef } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import {
  ChartColors,
  DetailedRenderer,
  HourglassChart,
  RelativesChart,
  createChart,
} from 'topola';
import type { TreeFamily, TreePerson } from '@/stores/canvasStore';
import { toTopolaData } from '@/utils/topolaAdapter';
import styles from './TopolaTree.module.css';

export type TopolaChartKind = 'hourglass' | 'relatives';

interface TopolaTreeProps {
  persons: TreePerson[];
  families: TreeFamily[];
  startPersonId: string | null;
  chart?: TopolaChartKind;
  onSelectPerson?: (personId: string) => void;
}

const SVG_ID = 'topola-chart';

/**
 * Prototype: renders the family tree with Topola's genealogy-aware layout.
 * Topola owns the layout and the person cards; pan/zoom is applied by d3-zoom
 * to a wrapper group so Topola's own transforms are left alone.
 */
const TopolaTree: React.FC<TopolaTreeProps> = ({
  persons,
  families,
  startPersonId,
  chart = 'hourglass',
  onSelectPerson,
}) => {
  const outerRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const selectRef = useRef(onSelectPerson);
  selectRef.current = onSelectPerson;

  const data = useMemo(() => toTopolaData(persons, families), [persons, families]);

  // Render (and re-render) the chart whenever data, root or chart type changes.
  useEffect(() => {
    if (!startPersonId || !data.indis.some((i) => i.id === startPersonId)) return;
    const outer = outerRef.current;
    const layer = layerRef.current;
    if (!outer || !layer) return;

    const handle = createChart({
      json: data,
      svgSelector: `#${SVG_ID}`,
      chartType: chart === 'relatives' ? RelativesChart : HourglassChart,
      renderer: DetailedRenderer,
      colors: ChartColors.COLOR_BY_SEX,
      animate: false,
      indiCallback: (info) => selectRef.current?.(info.id),
    });
    const info = handle.render({ startIndi: startPersonId });

    // Fit the chart to the viewport on first render of this dataset.
    const { width, height } = outer.getBoundingClientRect();
    const [w, h] = info.size;
    const scale = Math.min(1, (width - 40) / w, (height - 40) / h);
    const k = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const t = zoomIdentity
      .translate((width - w * k) / 2, (height - h * k) / 2)
      .scale(k);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        select(layer).attr('transform', event.transform.toString());
      });
    select(outer).call(zoomBehavior).call(zoomBehavior.transform, t);

    return () => {
      select(outer).on('.zoom', null);
    };
  }, [data, startPersonId, chart]);

  return (
    <svg
      ref={outerRef}
      className={styles.svg}
      role="img"
      aria-label="Family tree diagram"
    >
      <g ref={layerRef}>
        <svg id={SVG_ID} className={styles.chart} />
      </g>
    </svg>
  );
};

export default TopolaTree;

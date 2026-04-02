import React, { useRef, useCallback, useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import PersonCard from '@/components/PersonCard/PersonCard';
import ConnectorLines from '@/components/ConnectorLines/ConnectorLines';
import MarriageNode from '@/components/MarriageNode/MarriageNode';
import GenerationLabel from '@/components/GenerationLabel/GenerationLabel';
import Button from '@/components/Button/Button';
import styles from './TreeCanvas.module.css';

const TreeCanvas: React.FC = () => {
  const {
    nodes,
    connectors,
    zoom,
    panX,
    panY,
    isLoading,
    setZoom,
    setPan,
    setSelectedPerson,
    setContextMenu,
  } = useCanvasStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { x: panX, y: panY };
    },
    [panX, panY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan(panOrigin.current.x + dx, panOrigin.current.y + dy);
    },
    [setPan],
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newZoom = Math.max(0.5, Math.min(2, zoom + delta));
      setZoom(newZoom);
    },
    [zoom, setZoom],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
        setSelectedPerson(null);
        setContextMenu(null);
      }
    },
    [setSelectedPerson, setContextMenu],
  );

  // Gather unique generations for labels
  const generationSet = new Set(nodes.map((n) => n.generation));
  const generationRows = [...generationSet].sort((a, b) => a - b);

  // Find leftmost x across all nodes for label positioning
  const leftEdge = nodes.length > 0
    ? Math.min(...nodes.map((n) => n.x)) - 120
    : -200;

  // Spouse connectors with midPoints for marriage nodes
  const spouseConnectors = connectors.filter(
    (c) => c.type === 'spouse' && c.midPoint,
  );

  if (isLoading) {
    return (
      <div className={styles.canvasWrap}>
        <div className={styles.loading}>Loading tree…</div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={styles.canvasWrap}>
        <div className={styles.emptyState}>
          <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <p className={styles.emptyTitle}>No family members yet</p>
          <p className={styles.emptyText}>
            Add your first person to start building your family tree.
          </p>
          <Button variant="primary">Add your first person</Button>
        </div>
      </div>
    );
  }

  // Compute viewBox to fit all nodes with padding
  const allX = nodes.map((n) => n.x);
  const allY = nodes.map((n) => n.y);
  const minX = Math.min(...allX) - 200;
  const minY = Math.min(...allY) - 80;
  const maxX = Math.max(...allX) + 400;
  const maxY = Math.max(...allY) + 200;
  const vbWidth = maxX - minX;
  const vbHeight = maxY - minY;

  return (
    <div className={styles.canvasWrap}>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`${minX} ${minY} ${vbWidth} ${vbHeight}`}
        role="img"
        aria-label="Family tree diagram"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      >
        <g
          transform={`translate(${panX}, ${panY}) scale(${zoom})`}
        >
          <ConnectorLines />

          {spouseConnectors.map((c) => (
            <MarriageNode
              key={`marriage-${c.id}`}
              cx={c.midPoint!.x}
              cy={c.midPoint!.y}
            />
          ))}

          {generationRows.map((gen) => {
            const rowY = gen * 180;
            return (
              <GenerationLabel
                key={`gen-${gen}`}
                generation={gen + 1}
                x={leftEdge}
                y={rowY + 50}
              />
            );
          })}

          {nodes.map((node) => (
            <PersonCard key={node.person.id} node={node} />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default TreeCanvas;

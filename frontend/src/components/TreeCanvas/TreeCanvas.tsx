import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import PersonCard from '@/components/PersonCard/PersonCard';
import ConnectorLines from '@/components/ConnectorLines/ConnectorLines';
import MarriageNode from '@/components/MarriageNode/MarriageNode';
import GenerationLabel from '@/components/GenerationLabel/GenerationLabel';
import Button from '@/components/Button/Button';
import styles from './TreeCanvas.module.css';

interface TreeCanvasProps {
  onAddPerson?: () => void;
}

const TreeCanvas: React.FC<TreeCanvasProps> = ({ onAddPerson }) => {
  const {
    nodes,
    connectors,
    zoom,
    cameraX,
    cameraY,
    homePersonId,
    isLoading,
    setZoom,
    setCamera,
    setSelectedPerson,
    setContextMenu,
  } = useCanvasStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ w: 1200, h: 700 });

  // Track viewport size with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setViewportSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { x: cameraX, y: cameraY };
    },
    [cameraX, cameraY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      // Convert screen pixels to SVG units (drag right → camera moves left)
      setCamera(
        panOrigin.current.x - dx / zoom,
        panOrigin.current.y - dy / zoom,
      );
    },
    [zoom, setCamera],
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Zoom toward cursor
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;

      const oldZoom = zoom;
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(0.3, Math.min(4, oldZoom * zoomFactor));

      // Point in SVG coords under cursor before zoom
      const oldVbW = rect.width / oldZoom;
      const oldVbH = rect.height / oldZoom;
      const svgX = (cameraX - oldVbW / 2) + fx * oldVbW;
      const svgY = (cameraY - oldVbH / 2) + fy * oldVbH;

      // Adjust camera so that point stays under cursor after zoom
      const newVbW = rect.width / newZoom;
      const newVbH = rect.height / newZoom;
      const newCameraX = svgX - fx * newVbW + newVbW / 2;
      const newCameraY = svgY - fy * newVbH + newVbH / 2;

      setZoom(newZoom);
      setCamera(newCameraX, newCameraY);
    },
    [zoom, cameraX, cameraY, setZoom, setCamera],
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
      <div className={styles.canvasWrap} ref={containerRef}>
        <div className={styles.loading}>Loading tree…</div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={styles.canvasWrap} ref={containerRef}>
        <div className={styles.emptyState}>
          <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <p className={styles.emptyTitle}>No family members yet</p>
          <p className={styles.emptyText}>
            Add your first person to start building your family tree.
          </p>
          <Button variant="primary" onClick={onAddPerson}>Add your first person</Button>
        </div>
      </div>
    );
  }

  // Camera-based viewBox: viewport size / zoom gives SVG units visible
  const vbWidth = viewportSize.w / zoom;
  const vbHeight = viewportSize.h / zoom;
  const vbX = cameraX - vbWidth / 2;
  const vbY = cameraY - vbHeight / 2;

  return (
    <div className={styles.canvasWrap} ref={containerRef}>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`${vbX} ${vbY} ${vbWidth} ${vbHeight}`}
        role="img"
        aria-label="Family tree diagram"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
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
          const rowY = gen * 200;
          return (
            <GenerationLabel
              key={`gen-${gen}`}
              generation={gen + 1}
              x={leftEdge}
              y={rowY + 60}
            />
          );
        })}

        {nodes.map((node) => (
          <PersonCard
            key={node.person.id}
            node={node}
            isHome={node.person.id === homePersonId}
          />
        ))}
      </svg>
    </div>
  );
};

export default TreeCanvas;

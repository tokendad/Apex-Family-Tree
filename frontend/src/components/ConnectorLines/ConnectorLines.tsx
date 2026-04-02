import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

const ConnectorLines: React.FC = () => {
  const { connectors } = useCanvasStore();

  return (
    <g>
      {connectors.map((line) => {
        if (line.type === 'spouse') {
          return (
            <line
              key={line.id}
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
              stroke="#9ca3af"
              strokeWidth={2}
              fill="none"
            />
          );
        }

        if (line.type === 'sibling') {
          return (
            <line
              key={line.id}
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              fill="none"
            />
          );
        }

        // parent-child: vertical down from parent, horizontal, vertical down to child
        const midY = line.midPoint?.y ?? (line.from.y + line.to.y) / 2;
        const pathD = [
          `M ${line.from.x} ${line.from.y}`,
          `L ${line.from.x} ${midY}`,
          `L ${line.to.x} ${midY}`,
          `L ${line.to.x} ${line.to.y}`,
        ].join(' ');

        return (
          <path
            key={line.id}
            d={pathD}
            stroke="#9ca3af"
            strokeWidth={2}
            fill="none"
          />
        );
      })}
    </g>
  );
};

export default ConnectorLines;

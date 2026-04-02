import React from 'react';

interface MarriageNodeProps {
  cx: number;
  cy: number;
}

const MarriageNode: React.FC<MarriageNodeProps> = ({ cx, cy }) => {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill="#d1d5db"
      stroke="#9ca3af"
      strokeWidth={1.5}
    />
  );
};

export default MarriageNode;

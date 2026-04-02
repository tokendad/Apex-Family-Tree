import React from 'react';

interface GenerationLabelProps {
  generation: number;
  x: number;
  y: number;
}

const GenerationLabel: React.FC<GenerationLabelProps> = ({ generation, x, y }) => {
  return (
    <text
      x={x}
      y={y}
      fontSize="12"
      fontWeight="600"
      fill="#9ca3af"
      fontFamily="var(--font-family, sans-serif)"
      textAnchor="start"
    >
      GEN {generation}
    </text>
  );
};

export default GenerationLabel;

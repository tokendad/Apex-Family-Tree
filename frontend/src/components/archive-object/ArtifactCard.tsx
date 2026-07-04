import React from 'react';
import { Link } from 'react-router-dom';
import styles from './ArtifactCard.module.css';

interface ArtifactCardProps {
  href: string;
  title: string;
  subtitle?: string | null;
  /** Drives the placeholder glyph shown in the thumbnail area. */
  typeName?: string | null;
}

const GLYPHS: Array<[RegExp, string]> = [
  [/letter|document|record|certificate/i, '✉'],
  [/photo|image|picture/i, '▧'],
  [/recipe|handwrit/i, '⌁'],
];

function glyphFor(typeName?: string | null): string {
  if (typeName) {
    const hit = GLYPHS.find(([re]) => re.test(typeName));
    if (hit) return hit[1];
  }
  return '▤';
}

const ArtifactCard: React.FC<ArtifactCardProps> = ({ href, title, subtitle, typeName }) => (
  <Link to={href} className={styles.card}>
    <div className={styles.thumb} aria-hidden="true">{glyphFor(typeName)}</div>
    <div className={styles.meta}>
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </div>
  </Link>
);

export default ArtifactCard;

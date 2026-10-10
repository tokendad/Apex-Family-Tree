import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './ArtifactCard.module.css';

interface ArtifactCardProps {
  href: string;
  title: string;
  subtitle?: string | null;
  /** Drives the placeholder glyph shown in the thumbnail area. */
  typeName?: string | null;
  /**
   * The artifact's own image, when there is a file to show. Falls back to the
   * glyph if absent or if the image fails to load -- which it will for an
   * artifact that has no file behind it, and for any media item whose
   * thumbnail has not been generated.
   */
  imageSrc?: string | null;
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

const ArtifactCard: React.FC<ArtifactCardProps> = ({ href, title, subtitle, typeName, imageSrc }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(imageSrc) && !imgFailed;

  return (
    <Link to={href} className={styles.card}>
      <div className={styles.thumb} aria-hidden="true">
        {showImage ? (
          <img
            className={styles.thumbImg}
            src={imageSrc as string}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          glyphFor(typeName)
        )}
      </div>
      <div className={styles.meta}>
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
    </Link>
  );
};

export default ArtifactCard;

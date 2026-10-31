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
   * artifact that has no file behind it. A missing thumbnail is not such a
   * case: the endpoint serves the original instead.
   */
  imageSrc?: string | null;
  /**
   * An optional control rendered beneath the card -- "Set as portrait" and the
   * like. It is deliberately NOT inside the Link: a <button> nested in an <a>
   * is invalid HTML, and every click on it would navigate away before the
   * handler could do anything. The card and the control are siblings, and the
   * wrapper only appears when there is a control to put in it.
   */
  action?: React.ReactNode;
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

const ArtifactCard: React.FC<ArtifactCardProps> = ({ href, title, subtitle, typeName, imageSrc, action }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(imageSrc) && !imgFailed;

  const card = (
    <Link to={href} className={styles.card}>
      <div
        className={showImage ? `${styles.thumb} ${styles.thumbImage}` : styles.thumb}
        aria-hidden="true"
      >
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

  if (!action) return card;

  return (
    <div className={styles.cardWithAction}>
      {card}
      <div className={styles.cardAction}>{action}</div>
    </div>
  );
};

export default ArtifactCard;

import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCanvasStore } from '@/stores/canvasStore';
import type { TreeNode } from '@/stores/canvasStore';
import { getPersonDisplayName } from '@/utils/entityDisplay';
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants/card';
import styles from './PersonCard.module.css';

interface PersonCardProps {
  node: TreeNode;
  isHome?: boolean;
}

function extractYear(date: string | null): string | null {
  if (!date) return null;
  const m = date.match(/\b(\d{4})\b/);
  return m ? m[1] : null;
}

function formatDates(birth: string | null, death: string | null, isLiving: boolean): string | null {
  const b = extractYear(birth);
  const d = extractYear(death);

  if (b && d) return `${b} – ${d}`;
  if (b && !d && !isLiving) return `b. ${b}`;
  if (!b && d) return `d. ${d}`;
  if (isLiving && b) return `b. ${b} –`;
  // isLiving + no birth year, or neither year: return null
  return null;
}

function getInitials(given: string | null, surname: string | null): string {
  const g = given?.[0]?.toUpperCase() ?? '';
  const s = surname?.[0]?.toUpperCase() ?? '';
  return g + s || '?';
}

function sexClass(sex: string): string {
  switch (sex) {
    case 'M': return styles.male;
    case 'F': return styles.female;
    case 'X': return styles.other;
    default: return styles.unknown;
  }
}

function sexColor(sex: string): string {
  switch (sex) {
    case 'M': return '#3b82f6';
    case 'F': return '#ec4899';
    case 'X': return '#14b8a6';
    default: return '#9ca3af';
  }
}

const PersonCard: React.FC<PersonCardProps> = ({ node, isHome = false }) => {
  const navigate = useNavigate();
  const { person, x, y } = node;
  const {
    selectedPersonId,
    hoveredPersonId,
    setSelectedPerson,
    setHoveredPerson,
    setContextMenu,
  } = useCanvasStore();

  const isSelected = selectedPersonId === person.id;
  const isHovered = hoveredPersonId === person.id;
  const highlightedIds = useCanvasStore((s) => s.highlightedPersonIds);
  /* At least one claim about this person is not settled (#52). */
  const unsettledIds = useCanvasStore((s) => s.unsettledPersonIds);
  const hasUnsettledClaim = unsettledIds.has(person.id);
  const isHighlighted = highlightedIds.size > 0 && highlightedIds.has(person.id);
  const isDimmed = highlightedIds.size > 0 && !highlightedIds.has(person.id);
  const name = getPersonDisplayName(person);
  const initials = getInitials(person.given_name, person.surname);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedPerson(person.id);
    },
    [person.id, setSelectedPerson],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, personId: person.id });
    },
    [person.id, setContextMenu],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate(`/people/${person.id}`);
    },
    [navigate, person.id],
  );

  const cls = [
    styles.card,
    sexClass(person.sex),
    isSelected ? styles.selected : '',
    isHovered ? styles.hovered : '',
    isHighlighted ? styles.highlighted : '',
    isDimmed ? styles.dimmed : '',
  ]
    .filter(Boolean)
    .join(' ');

  const dateLabel = formatDates(person.birth_date, person.death_date, person.is_living);
  const ariaLabel = dateLabel ? `${name}, ${dateLabel}` : name;

  return (
    <foreignObject x={x} y={y} width={CARD_WIDTH} height={CARD_HEIGHT}>
      <div
        className={cls}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHoveredPerson(person.id)}
        onMouseLeave={() => setHoveredPerson(null)}
      >
        {isHome && <span className={styles.homeBadge}>HOME</span>}

        {(person.sex === 'M' || person.sex === 'F') && (
          <span
            className={styles.sexIcon}
            aria-hidden="true"
            style={{ color: sexColor(person.sex) }}
          >
            {person.sex === 'M' ? '♂' : '♀'}
          </span>
        )}

        {person.photo_url ? (
          <img
            src={person.photo_url}
            alt={name}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            className={styles.avatar}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              backgroundColor: sexColor(person.sex),
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {initials}
          </div>
        )}

        <div className={styles.info}>
          <span className={styles.name} title={name}>{name}</span>
          <span
            className={styles.dates}
            data-unsettled={hasUnsettledClaim ? 'true' : undefined}
            style={dateLabel === null ? { visibility: 'hidden' } : undefined}
          >
            {dateLabel ?? ' '}
            {/* An icon as well as the dotted underline, because red and green
                both sit on the confidence ramp and a mark must never rest on
                colour alone. The card says only THAT something is open; which
                claim, and how open, is the person page's job. */}
            {hasUnsettledClaim && (
              <svg
                className={styles.unsettledMark}
                viewBox="0 0 12 12"
                role="img"
                aria-label="Has an unsettled claim"
              >
                <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 3.4v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="6" cy="8.7" r="0.8" fill="currentColor" />
              </svg>
            )}
          </span>
        </div>
      </div>
    </foreignObject>
  );
};

export default PersonCard;

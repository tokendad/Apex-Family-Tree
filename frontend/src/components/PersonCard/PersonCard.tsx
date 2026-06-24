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

function formatDates(birth: string | null, death: string | null, isLiving: boolean): string | null {
  const b = birth ? birth.substring(0, 4) : null;
  const d = death ? death.substring(0, 4) : null;

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
            style={{ color: person.sex === 'M' ? '#3b82f6' : '#ec4899' }}
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
            style={dateLabel === null ? { visibility: 'hidden' } : undefined}
          >
            {dateLabel ?? ' '}
          </span>
        </div>
      </div>
    </foreignObject>
  );
};

export default PersonCard;

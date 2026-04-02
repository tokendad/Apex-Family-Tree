import React, { useCallback } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import type { TreeNode } from '@/stores/canvasStore';
import styles from './PersonCard.module.css';

interface PersonCardProps {
  node: TreeNode;
  isHome?: boolean;
}

function formatName(given: string | null, surname: string | null): string {
  const parts = [given, surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function formatDates(birth: string | null, death: string | null, isLiving: boolean): string {
  const b = birth ? birth.substring(0, 4) : '?';
  if (isLiving) return `b. ${b}`;
  const d = death ? death.substring(0, 4) : '?';
  return `${b} – ${d}`;
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

const CARD_WIDTH = 200;
const CARD_HEIGHT = 120;

const PersonCard: React.FC<PersonCardProps> = ({ node, isHome = false }) => {
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
  const name = formatName(person.given_name, person.surname);
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

  const cls = [
    styles.card,
    sexClass(person.sex),
    isSelected ? styles.selected : '',
    isHovered ? styles.hovered : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <foreignObject x={x} y={y} width={CARD_WIDTH} height={CARD_HEIGHT}>
      <div
        className={cls}
        onClick={handleClick}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHoveredPerson(person.id)}
        onMouseLeave={() => setHoveredPerson(null)}
      >
        {isHome && <span className={styles.homeBadge}>HOME</span>}

        {person.photo_url ? (
          <img
            src={person.photo_url}
            alt={name}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            className={styles.avatar}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: sexColor(person.sex),
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {initials}
          </div>
        )}

        <div className={styles.info}>
          <span className={styles.name} title={name}>{name}</span>
          <span className={styles.dates}>
            {formatDates(person.birth_date, person.death_date, person.is_living)}
          </span>
        </div>
      </div>
    </foreignObject>
  );
};

export default PersonCard;

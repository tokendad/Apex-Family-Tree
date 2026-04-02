import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import Avatar from '@/components/Avatar/Avatar';
import Button from '@/components/Button/Button';
import styles from './DetailPanel.module.css';

function formatName(given: string | null, surname: string | null): string {
  const parts = [given, surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function sexLabel(sex: string): string {
  switch (sex) {
    case 'M': return 'Male';
    case 'F': return 'Female';
    case 'X': return 'Other';
    default: return 'Unknown';
  }
}

const DetailPanel: React.FC = () => {
  const { selectedPersonId, nodes, families, setSelectedPerson } = useCanvasStore();

  const selectedNode = nodes.find((n) => n.person.id === selectedPersonId);
  if (!selectedNode) return null;

  const person = selectedNode.person;
  const name = formatName(person.given_name, person.surname);

  // Find relationships
  const parentFamilies = families.filter((f) => f.children_ids.includes(person.id));
  const parentIds = parentFamilies.flatMap((f) =>
    [f.spouse1_id, f.spouse2_id].filter((id): id is string => id !== null && id !== person.id),
  );

  const spouseFamilies = families.filter(
    (f) => f.spouse1_id === person.id || f.spouse2_id === person.id,
  );
  const spouseIds = spouseFamilies.map((f) =>
    f.spouse1_id === person.id ? f.spouse2_id : f.spouse1_id,
  ).filter((id): id is string => id !== null);

  const childrenIds = spouseFamilies.flatMap((f) => f.children_ids);
  const uniqueChildrenIds = [...new Set(childrenIds)];

  const getPersonName = (id: string): string => {
    const node = nodes.find((n) => n.person.id === id);
    if (!node) return 'Unknown';
    return formatName(node.person.given_name, node.person.surname);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Avatar name={name} src={person.photo_url ?? undefined} size="lg" />
        <span className={styles.name}>{name}</span>
        <span className={styles.dates}>
          {person.birth_date ? `b. ${person.birth_date}` : ''}
          {person.death_date ? ` — d. ${person.death_date}` : ''}
          {!person.birth_date && !person.death_date ? 'No dates recorded' : ''}
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Vital Information</span>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Sex</span>
            <span className={styles.infoValue}>{sexLabel(person.sex)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Living</span>
            <span className={styles.infoValue}>{person.is_living ? 'Yes' : 'No'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Privacy</span>
            <span className={styles.infoValue}>{person.is_private ? 'Private' : 'Public'}</span>
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionTitle}>Parents</span>
          {parentIds.length > 0 ? (
            <div className={styles.relList}>
              {parentIds.map((id) => (
                <button
                  key={id}
                  className={styles.relItem}
                  onClick={() => setSelectedPerson(id)}
                >
                  {getPersonName(id)}
                </button>
              ))}
            </div>
          ) : (
            <span className={styles.emptyRel}>No parents recorded</span>
          )}
        </div>

        <div className={styles.section}>
          <span className={styles.sectionTitle}>Spouses</span>
          {spouseIds.length > 0 ? (
            <div className={styles.relList}>
              {spouseIds.map((id) => (
                <button
                  key={id}
                  className={styles.relItem}
                  onClick={() => setSelectedPerson(id)}
                >
                  {getPersonName(id)}
                </button>
              ))}
            </div>
          ) : (
            <span className={styles.emptyRel}>No spouses recorded</span>
          )}
        </div>

        <div className={styles.section}>
          <span className={styles.sectionTitle}>Children</span>
          {uniqueChildrenIds.length > 0 ? (
            <div className={styles.relList}>
              {uniqueChildrenIds.map((id) => (
                <button
                  key={id}
                  className={styles.relItem}
                  onClick={() => setSelectedPerson(id)}
                >
                  {getPersonName(id)}
                </button>
              ))}
            </div>
          ) : (
            <span className={styles.emptyRel}>No children recorded</span>
          )}
        </div>

        <div className={styles.section}>
          <span className={styles.sectionTitle}>Media</span>
          <div className={styles.mediaGrid}>
            <div className={styles.mediaPlaceholder}>No media</div>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="ghost" size="sm" onClick={() => setSelectedPerson(null)}>
          Close
        </Button>
        <Button variant="primary" size="sm">
          Edit
        </Button>
      </div>
    </div>
  );
};

export default DetailPanel;

import type { TreePerson, TreeFamily, TreeNode, ConnectorLine } from '@/stores/canvasStore';

const CARD_WIDTH = 200;
const CARD_HEIGHT = 120;
const H_GAP = 40;
const V_GAP = 180;

interface LayoutInput {
  persons: TreePerson[];
  families: TreeFamily[];
  rootPersonId: string | null;
}

interface LayoutOutput {
  nodes: TreeNode[];
  connectors: ConnectorLine[];
}

/**
 * Assigns a generation number to each person via BFS from the root.
 * Parents get generation - 1, children get generation + 1.
 */
function assignGenerations(
  rootId: string,
  persons: Map<string, TreePerson>,
  families: TreeFamily[],
): Map<string, number> {
  const genMap = new Map<string, number>();
  const visited = new Set<string>();
  const queue: { id: string; gen: number }[] = [{ id: rootId, gen: 0 }];
  visited.add(rootId);

  while (queue.length > 0) {
    const { id, gen } = queue.shift()!;
    genMap.set(id, gen);

    for (const family of families) {
      const isSpouse =
        family.spouse1_id === id || family.spouse2_id === id;
      const isChild = family.children_ids.includes(id);

      if (isSpouse) {
        // Spouse is same generation
        const otherId =
          family.spouse1_id === id ? family.spouse2_id : family.spouse1_id;
        if (otherId && !visited.has(otherId) && persons.has(otherId)) {
          visited.add(otherId);
          queue.push({ id: otherId, gen });
        }
        // Children are next generation
        for (const childId of family.children_ids) {
          if (!visited.has(childId) && persons.has(childId)) {
            visited.add(childId);
            queue.push({ id: childId, gen: gen + 1 });
          }
        }
      }

      if (isChild) {
        // Parents are previous generation
        for (const parentId of [family.spouse1_id, family.spouse2_id]) {
          if (parentId && !visited.has(parentId) && persons.has(parentId)) {
            visited.add(parentId);
            queue.push({ id: parentId, gen: gen - 1 });
          }
        }
      }
    }
  }

  return genMap;
}

/**
 * Groups persons by generation row.
 */
function groupByGeneration(genMap: Map<string, number>): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const [id, gen] of genMap) {
    if (!groups.has(gen)) groups.set(gen, []);
    groups.get(gen)!.push(id);
  }
  return groups;
}

/**
 * Produces positioned nodes and connector lines from raw tree data.
 */
export function layoutTree(input: LayoutInput): LayoutOutput {
  const { persons, families, rootPersonId } = input;

  if (persons.length === 0 || !rootPersonId) {
    return { nodes: [], connectors: [] };
  }

  const personMap = new Map(persons.map((p) => [p.id, p]));

  if (!personMap.has(rootPersonId)) {
    return { nodes: [], connectors: [] };
  }

  const genMap = assignGenerations(rootPersonId, personMap, families);
  const genGroups = groupByGeneration(genMap);

  // Normalize generation numbers so the minimum is 0
  const minGen = Math.min(...genGroups.keys());
  const normalizedGroups = new Map<number, string[]>();
  for (const [gen, ids] of genGroups) {
    normalizedGroups.set(gen - minGen, ids);
  }

  // Position nodes
  const nodePositions = new Map<string, { x: number; y: number; generation: number }>();
  const sortedGens = [...normalizedGroups.keys()].sort((a, b) => a - b);

  for (const gen of sortedGens) {
    const ids = normalizedGroups.get(gen)!;
    const rowWidth = ids.length * (CARD_WIDTH + H_GAP) - H_GAP;
    const startX = -rowWidth / 2;

    for (let i = 0; i < ids.length; i++) {
      nodePositions.set(ids[i], {
        x: startX + i * (CARD_WIDTH + H_GAP),
        y: gen * V_GAP,
        generation: gen,
      });
    }
  }

  // Simple collision avoidance: shift spouse pairs to be adjacent
  for (const family of families) {
    if (family.spouse1_id && family.spouse2_id) {
      const pos1 = nodePositions.get(family.spouse1_id);
      const pos2 = nodePositions.get(family.spouse2_id);
      if (pos1 && pos2 && pos1.generation === pos2.generation) {
        const midX = (pos1.x + pos2.x) / 2;
        pos1.x = midX - (CARD_WIDTH + H_GAP) / 2;
        pos2.x = midX + (CARD_WIDTH + H_GAP) / 2;
      }
    }

    // Center children under parents
    if (family.children_ids.length > 0) {
      const parentIds = [family.spouse1_id, family.spouse2_id].filter(Boolean) as string[];
      const parentPositions = parentIds.map((id) => nodePositions.get(id)).filter(Boolean);
      if (parentPositions.length > 0) {
        const parentCenterX =
          parentPositions.reduce((sum, p) => sum + p!.x + CARD_WIDTH / 2, 0) /
          parentPositions.length;

        const childPositions = family.children_ids
          .map((id) => nodePositions.get(id))
          .filter(Boolean);

        if (childPositions.length > 0) {
          const childrenWidth =
            childPositions.length * (CARD_WIDTH + H_GAP) - H_GAP;
          const childStartX = parentCenterX - childrenWidth / 2;

          for (let i = 0; i < family.children_ids.length; i++) {
            const pos = nodePositions.get(family.children_ids[i]);
            if (pos) {
              pos.x = childStartX + i * (CARD_WIDTH + H_GAP);
            }
          }
        }
      }
    }
  }

  // Build nodes array
  const nodes: TreeNode[] = [];
  for (const [id, pos] of nodePositions) {
    const person = personMap.get(id);
    if (person) {
      nodes.push({ person, x: pos.x, y: pos.y, generation: pos.generation });
    }
  }

  // Build connector lines
  const connectors: ConnectorLine[] = [];
  let connectorIdx = 0;

  for (const family of families) {
    // Spouse connector
    if (family.spouse1_id && family.spouse2_id) {
      const pos1 = nodePositions.get(family.spouse1_id);
      const pos2 = nodePositions.get(family.spouse2_id);
      if (pos1 && pos2) {
        const midX = (pos1.x + CARD_WIDTH / 2 + pos2.x + CARD_WIDTH / 2) / 2;
        const midY = pos1.y + CARD_HEIGHT / 2;
        connectors.push({
          id: `connector-${connectorIdx++}`,
          type: 'spouse',
          from: { x: pos1.x + CARD_WIDTH, y: pos1.y + CARD_HEIGHT / 2 },
          to: { x: pos2.x, y: pos2.y + CARD_HEIGHT / 2 },
          midPoint: { x: midX, y: midY },
        });
      }
    }

    // Parent-child connectors
    const parentIds = [family.spouse1_id, family.spouse2_id].filter(Boolean) as string[];
    const parentPositions = parentIds
      .map((id) => nodePositions.get(id))
      .filter(Boolean);

    if (parentPositions.length > 0 && family.children_ids.length > 0) {
      const parentCenterX =
        parentPositions.reduce((sum, p) => sum + p!.x + CARD_WIDTH / 2, 0) /
        parentPositions.length;
      const parentBottomY = parentPositions[0]!.y + CARD_HEIGHT;

      // Marriage midpoint for line origin
      const midPointY = parentBottomY + (V_GAP - CARD_HEIGHT) / 2;

      for (const childId of family.children_ids) {
        const childPos = nodePositions.get(childId);
        if (childPos) {
          connectors.push({
            id: `connector-${connectorIdx++}`,
            type: 'parent-child',
            from: { x: parentCenterX, y: parentBottomY },
            to: { x: childPos.x + CARD_WIDTH / 2, y: childPos.y },
            midPoint: { x: parentCenterX, y: midPointY },
          });
        }
      }
    }
  }

  return { nodes, connectors };
}

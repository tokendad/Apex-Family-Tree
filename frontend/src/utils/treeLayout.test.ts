import { describe, expect, it } from 'vitest';
import type { TreeFamily, TreeNode, TreePerson } from '@/stores/canvasStore';
import { layoutTree } from './treeLayout';

const CARD_WIDTH = 240;

function person(id: string): TreePerson {
  return {
    id,
    given_name: id,
    surname: 'Test',
    sex: 'U',
    birth_date: null,
    death_date: null,
    is_living: true,
    is_private: false,
    photo_url: null,
  };
}

function expectNoHorizontalOverlap(nodes: TreeNode[]) {
  const byGeneration = new Map<number, TreeNode[]>();

  for (const node of nodes) {
    byGeneration.set(node.generation, [...(byGeneration.get(node.generation) ?? []), node]);
  }

  for (const rowNodes of byGeneration.values()) {
    const sorted = [...rowNodes].sort((a, b) => a.x - b.x);

    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].x - sorted[i - 1].x).toBeGreaterThanOrEqual(CARD_WIDTH);
    }
  }
}

describe('layoutTree', () => {
  it('keeps same-generation cards from overlapping after family centering', () => {
    const people = [
      'root',
      'spouse',
      'sibling-a',
      'sibling-b',
      'cousin',
      'parent-a',
      'parent-b',
      'parent-c',
      'parent-d',
    ].map(person);
    const families: TreeFamily[] = [
      {
        id: 'root-family',
        spouse1_id: 'root',
        spouse2_id: 'spouse',
        children_ids: [],
        marriage_date: null,
      },
      {
        id: 'root-parents',
        spouse1_id: 'parent-a',
        spouse2_id: 'parent-b',
        children_ids: ['root', 'sibling-a', 'sibling-b'],
        marriage_date: null,
      },
      {
        id: 'spouse-parents',
        spouse1_id: 'parent-c',
        spouse2_id: 'parent-d',
        children_ids: ['spouse', 'cousin'],
        marriage_date: null,
      },
    ];

    const { nodes } = layoutTree({
      persons: people,
      families,
      rootPersonId: 'root',
    });

    expectNoHorizontalOverlap(nodes);
  });
});

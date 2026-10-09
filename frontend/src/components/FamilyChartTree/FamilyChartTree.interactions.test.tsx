import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import FamilyChartTree from './FamilyChartTree';
import type { TreePerson } from '@/stores/canvasStore';

// The library draws its own DOM and needs layout, so it is stubbed. What is
// under test is the delegated event handling on the container, not the chart.
vi.mock('family-chart', () => ({
  createChart: () => {
    const chart: Record<string, unknown> = {};
    const chainable = [
      'setTransitionTime', 'setCardXSpacing', 'setCardYSpacing', 'setAncestryDepth',
      'setProgenyDepth', 'setShowSiblingsOfMain', 'setSingleParentEmptyCard',
      'setOrientationHorizontal', 'setOrientationVertical', 'setCardHtml',
      'setCardDisplay', 'setCardDim', 'setMiniTree', 'setStyle', 'setAfterUpdate',
      'updateMainId', 'updateTree',
    ];
    for (const name of chainable) chart[name] = () => chart;
    chart.getMainDatum = () => ({ id: 'p1' });
    return chart;
  },
}));
vi.mock('family-chart/styles/family-chart.css', () => ({}));

const person = (id: string): TreePerson => ({
  id, given_name: id, middle_name: null, surname: 'Test', sex: 'U',
  birth_date: null, death_date: null, is_living: true, is_private: false, photo_url: null,
});

/** Mimics the card markup family-chart produces: a .card_cont with a d3 datum. */
function addCard(container: HTMLElement, id: string | null) {
  const card = document.createElement('div');
  card.className = 'card_cont';
  if (id !== null) {
    (card as unknown as { __data__: unknown }).__data__ = { data: { id } };
  }
  const inner = document.createElement('span');
  inner.textContent = 'card body';
  card.appendChild(inner);
  container.querySelector('.f3')!.appendChild(card);
  return inner;
}

function renderTree(props: Partial<React.ComponentProps<typeof FamilyChartTree>> = {}) {
  return render(
    <FamilyChartTree
      persons={[person('p1'), person('p2')]}
      families={[]}
      mainPersonId="p1"
      {...props}
    />,
  );
}

describe('FamilyChartTree — interactions the main tree already had', () => {
  it('opens the person on double-click', () => {
    const onPersonOpen = vi.fn();
    const { container } = renderTree({ onPersonOpen });
    const inner = addCard(container, 'p2');

    fireEvent.dblClick(inner);
    expect(onPersonOpen).toHaveBeenCalledWith('p2');
  });

  it('raises a context menu on right-click, with viewport coordinates', () => {
    const onPersonContextMenu = vi.fn();
    const { container } = renderTree({ onPersonContextMenu });
    const inner = addCard(container, 'p2');

    fireEvent.contextMenu(inner, { clientX: 120, clientY: 340 });
    expect(onPersonContextMenu).toHaveBeenCalledWith('p2', 120, 340);
  });

  it('resolves the person from a click on anything inside the card', () => {
    const onPersonOpen = vi.fn();
    const { container } = renderTree({ onPersonOpen });
    const inner = addCard(container, 'p1');

    // The event target is a child element, not the card itself.
    fireEvent.dblClick(inner);
    expect(onPersonOpen).toHaveBeenCalledWith('p1');
  });

  it('ignores a card whose id belongs to nobody in the tree', () => {
    // family-chart renders placeholder and "add relative" cards.
    const onPersonOpen = vi.fn();
    const onPersonContextMenu = vi.fn();
    const { container } = renderTree({ onPersonOpen, onPersonContextMenu });
    const inner = addCard(container, 'not-a-person');

    fireEvent.dblClick(inner);
    fireEvent.contextMenu(inner);
    expect(onPersonOpen).not.toHaveBeenCalled();
    expect(onPersonContextMenu).not.toHaveBeenCalled();
  });

  it('ignores clicks on the empty canvas', () => {
    const onPersonContextMenu = vi.fn();
    const { container } = renderTree({ onPersonContextMenu });
    fireEvent.contextMenu(container.querySelector('.f3')!);
    expect(onPersonContextMenu).not.toHaveBeenCalled();
  });

  it('suppresses the browser menu only over a card', () => {
    const { container } = renderTree({ onPersonContextMenu: vi.fn() });
    const inner = addCard(container, 'p2');

    const onCard = fireEvent.contextMenu(inner, { cancelable: true });
    const offCard = fireEvent.contextMenu(container.querySelector('.f3')!, { cancelable: true });
    // fireEvent returns false when preventDefault was called.
    expect(onCard).toBe(false);
    expect(offCard).toBe(true);
  });
});

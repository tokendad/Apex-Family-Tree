import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from './modalStore';

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('useModalStore', () => {
  it('starts with an empty stack', () => {
    expect(useModalStore.getState().stack).toHaveLength(0);
  });

  it('push adds an entry with a unique id', () => {
    const resolve = () => {};
    const id = useModalStore.getState().push({
      component: 'PersonEditor',
      props: { mode: 'create' },
      resolve,
    });
    const stack = useModalStore.getState().stack;
    expect(stack).toHaveLength(1);
    expect(stack[0].id).toBe(id);
    expect(stack[0].component).toBe('PersonEditor');
  });

  it('pop removes the entry and calls resolve with the result', () => {
    let resolved: unknown;
    const id = useModalStore.getState().push({
      component: 'PersonEditor',
      props: {},
      resolve: (r) => { resolved = r; },
    });
    useModalStore.getState().pop(id, { action: 'cancelled' });
    expect(useModalStore.getState().stack).toHaveLength(0);
    expect(resolved).toEqual({ action: 'cancelled' });
  });

  it('pop only removes the targeted entry from the stack', () => {
    const id1 = useModalStore.getState().push({ component: 'A', props: {}, resolve: () => {} });
    useModalStore.getState().push({ component: 'B', props: {}, resolve: () => {} });
    useModalStore.getState().pop(id1, { action: 'cancelled' });
    expect(useModalStore.getState().stack).toHaveLength(1);
    expect(useModalStore.getState().stack[0].component).toBe('B');
  });
});

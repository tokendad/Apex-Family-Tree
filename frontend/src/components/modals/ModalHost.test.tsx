import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from './modalStore';
import ModalHost from './ModalHost';

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('ModalHost', () => {
  it('renders without crashing when stack is empty', () => {
    const { container } = render(<ModalHost />);
    expect(container.firstChild).toBeNull();
  });
});

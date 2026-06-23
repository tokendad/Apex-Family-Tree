import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from './modalStore';
import ModalManager from './ModalManager';

const FakeEditor = ({
  onClose,
}: {
  modalId: string;
  onClose: (result: { action: 'cancelled' }) => void;
}) => (
  <div role="dialog" aria-label="Fake Editor">
    <button onClick={() => onClose({ action: 'cancelled' })}>Cancel</button>
  </div>
);

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('ModalManager', () => {
  it('renders nothing when stack is empty', () => {
    const { container } = render(<ModalManager />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a dialog when a modal is pushed', () => {
    act(() => {
      useModalStore.getState().push({
        component: 'FakeEditor',
        props: {},
        resolve: () => {},
      });
    });
    render(<ModalManager registry={{ FakeEditor }} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the top modal when Escape is pressed', () => {
    let resolved: unknown;
    act(() => {
      useModalStore.getState().push({
        component: 'FakeEditor',
        props: {},
        resolve: (r) => { resolved = r; },
      });
    });
    render(<ModalManager registry={{ FakeEditor }} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useModalStore.getState().stack).toHaveLength(0);
    expect(resolved).toEqual({ action: 'cancelled' });
  });

  it('closes the top modal when backdrop is clicked', () => {
    let resolved: unknown;
    act(() => {
      useModalStore.getState().push({
        component: 'FakeEditor',
        props: {},
        resolve: (r) => { resolved = r; },
      });
    });
    render(<ModalManager registry={{ FakeEditor }} />);
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(useModalStore.getState().stack).toHaveLength(0);
    expect(resolved).toEqual({ action: 'cancelled' });
  });
});

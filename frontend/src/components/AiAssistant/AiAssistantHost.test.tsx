import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiAssistantHost from './AiAssistantHost';
import { useAiAssistantStore } from '@/stores/aiAssistantStore';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }) as unknown as typeof fetch;
  useAiAssistantStore.setState({ open: false });
});

afterEach(() => {
  useAiAssistantStore.setState({ open: false });
});

describe('AiAssistantHost', () => {
  it('renders nothing when the store is closed', () => {
    render(<AiAssistantHost />);
    expect(screen.queryByRole('dialog', { name: 'AI Assistant' })).not.toBeInTheDocument();
  });

  it('portal-renders the panel when the store is open, from anywhere in the tree', () => {
    useAiAssistantStore.setState({ open: true });
    render(<AiAssistantHost />);
    expect(screen.getByRole('dialog', { name: 'AI Assistant' })).toBeInTheDocument();
  });

  it('closes when the panel close button is clicked', () => {
    useAiAssistantStore.setState({ open: true });
    render(<AiAssistantHost />);
    screen.getByRole('button', { name: 'Close AI Assistant' }).click();
    expect(useAiAssistantStore.getState().open).toBe(false);
  });
});

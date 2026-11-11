import { describe, expect, it } from 'vitest';
import { useAiAssistantStore } from './aiAssistantStore';

describe('aiAssistantStore', () => {
  it('starts closed', () => {
    useAiAssistantStore.setState({ open: false });
    expect(useAiAssistantStore.getState().open).toBe(false);
  });

  it('toggle flips open state', () => {
    useAiAssistantStore.setState({ open: false });
    useAiAssistantStore.getState().toggle();
    expect(useAiAssistantStore.getState().open).toBe(true);
    useAiAssistantStore.getState().toggle();
    expect(useAiAssistantStore.getState().open).toBe(false);
  });

  it('close always sets open to false', () => {
    useAiAssistantStore.setState({ open: true });
    useAiAssistantStore.getState().close();
    expect(useAiAssistantStore.getState().open).toBe(false);
  });
});

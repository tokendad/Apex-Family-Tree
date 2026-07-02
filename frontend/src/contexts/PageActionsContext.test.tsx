import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PageActionsProvider, usePageActions, usePageActionsValue } from './PageActionsContext';
import ContextActionsMenu from '@/components/archive-object/ContextActionsMenu';

function FakeChrome() {
  const { title, actions } = usePageActionsValue();
  if (actions.length === 0) return null;
  return <ContextActionsMenu title={title || undefined} actions={actions} />;
}

function FakePage({ onEdit }: { onEdit: () => void }) {
  usePageActions('Actions for John LeFort', [
    { id: 'connect', label: 'Connect Artifact', onSelect: () => undefined },
    { id: 'edit', label: 'Edit Person', group: 'manage', onSelect: onEdit },
  ]);
  return <div>page body</div>;
}

describe('PageActionsContext', () => {
  it('renders registered actions in the chrome menu with grouping', async () => {
    const onEdit = vi.fn();
    render(
      <PageActionsProvider>
        <FakeChrome />
        <FakePage onEdit={onEdit} />
      </PageActionsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByText('Actions for John LeFort')).toBeInTheDocument();
    expect(screen.getByText('Manage')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /edit person/i }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('clears actions when the page unmounts', () => {
    const { rerender } = render(
      <PageActionsProvider>
        <FakeChrome />
        <FakePage onEdit={() => undefined} />
      </PageActionsProvider>,
    );
    expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument();

    rerender(
      <PageActionsProvider>
        <FakeChrome />
      </PageActionsProvider>,
    );
    expect(screen.queryByRole('button', { name: /actions/i })).not.toBeInTheDocument();
  });
});

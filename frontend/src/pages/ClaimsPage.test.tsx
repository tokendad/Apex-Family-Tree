import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClaimsPage from './ClaimsPage';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: true }),
}));

vi.mock('@/stores/searchStore', () => ({
  /* Called both ways in this tree: with a selector and bare. */
  useSearchStore: (selector?: (s: unknown) => unknown) => {
    const state = { globalQuery: '' };
    return selector ? selector(state) : state;
  },
}));

/* The shell pulls in auth and routing chrome that this page does not own. */
vi.mock('@/components/AppShell/AppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({
  __esModule: true,
  default: () => null,
}));

/* The picker opens a modal in the real app; this page's job here is to show it
   is used at all, in place of the raw id field it replaced. */
vi.mock('@/components/entity-pickers/ObjectPicker', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div data-testid="object-picker">{label}</div>,
}));

const claims = [
  {
    id: 'c-1',
    title: 'Her father is Preston.',
    statement: 'Her father is Preston, not Marlow.',
    claim_type: 'parentage',
    status: 'conflicted' as const,
    subject_title: 'Hadley Marlow',
    confidence_level_id: 'confidence_confirmed',
    confidence_level_name: 'Confirmed',
    confidence_score: 95,
    evidence_count: 3,
  },
  {
    id: 'c-2',
    title: 'Her birth year.',
    statement: 'She was born in 1896.',
    claim_type: 'date',
    status: 'open' as const,
    subject_title: 'Hadley Marlow',
    confidence_level_id: 'confidence_possible',
    confidence_level_name: 'Possible',
    confidence_score: 25,
    evidence_count: 0,
  },
];

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('confidence-levels')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [
        { id: 'confidence_confirmed', name: 'Confirmed', numeric_value: 95 },
        { id: 'confidence_unknown', name: 'Unknown', numeric_value: null },
      ] }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: claims }) });
  }) as unknown as typeof fetch;
});

const renderPage = () => render(<MemoryRouter><ClaimsPage /></MemoryRouter>);

describe('ClaimsPage', () => {
  it('shows each claim with its confidence pill and its status in words', async () => {
    const { container } = renderPage();

    expect(await screen.findByText('Her father is Preston, not Marlow.')).toBeInTheDocument();
    expect(screen.getByText('Confirmed · 95')).toBeInTheDocument();
    expect(screen.getByText('Possible · 25')).toBeInTheDocument();
    /* "conflicted" is a state of the records; the list says so in words a
       reader recognises rather than printing the enum. */
    expect(screen.getByText('Records conflict')).toBeInTheDocument();
    expect(container.querySelector('[data-confidence="confirmed"]')).not.toBeNull();
    expect(container.querySelector('[data-confidence="possible"]')).not.toBeNull();
  });

  it('asks for the subject with a picker, not an archive-object id', async () => {
    renderPage();
    await screen.findByText('Her father is Preston, not Marlow.');

    fireEvent.click(screen.getByRole('button', { name: /new claim/i }));

    await waitFor(() => expect(screen.getByTestId('object-picker')).toBeInTheDocument());
    expect(screen.getByTestId('object-picker')).toHaveTextContent('Subject');
    /* The field this replaced. Typing an internal id was never something a
       reader could reasonably do. */
    expect(screen.queryByText(/Archive Object ID/i)).not.toBeInTheDocument();
  });

  it('offers confidence levels with their numbers', async () => {
    renderPage();
    await screen.findByText('Her father is Preston, not Marlow.');
    fireEvent.click(screen.getByRole('button', { name: /new claim/i }));

    expect(await screen.findByRole('option', { name: 'Confirmed · 95' })).toBeInTheDocument();
    /* A level with no numeric value shows its name alone. "Unknown" is also a
       Status option, so this checks the thing that would actually be wrong
       rather than counting matches. */
    expect(screen.getAllByRole('option', { name: 'Unknown' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('option', { name: /Unknown · / })).toBeNull();
  });

  it('counts attached records rather than calling them evidence links', async () => {
    renderPage();
    await screen.findByText('Her father is Preston, not Marlow.');

    expect(screen.getByText('3 records')).toBeInTheDocument();
    expect(screen.getByText('0 records')).toBeInTheDocument();
  });
});

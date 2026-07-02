import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PersonDetailPage from './PersonDetailPage';
import { PageActionsProvider, usePageActionsValue } from '@/contexts/PageActionsContext';
import ContextActionsMenu from '@/components/archive-object/ContextActionsMenu';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/Avatar/Avatar', () => ({
  default: () => null,
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: false, canDelete: false }),
}));

// Minimal person fixture
const stubPerson = {
  id: 'per-1',
  sex: 'F',
  is_living: 0,
  is_private: 0,
  birth_date: null,
  birth_place: null,
  death_date: null,
  death_place: null,
  photo_url: null,
  names: [{ given_name: 'Jane', surname: 'Doe', name_type: 'birth', is_primary: 1 }],
  events: [],
  notes: [],
  sources: [],
};

const stubConnectedObjects = [
  {
    relationship_id: 'r1',
    relationship_type_code: 'subject_of',
    relationship_type_name: 'Subject of',
    role: 'subject',
    object_id: 'artifact-1',
    object_type: 'artifact',
    title: 'WWII Draft Letter',
    summary: null,
    artifact_type_name: 'Letter',
  },
  {
    relationship_id: 'r2',
    relationship_type_code: 'subject_of',
    relationship_type_name: 'Subject of',
    role: 'subject',
    object_id: 'story-1',
    object_type: 'story',
    title: 'The Recipe Box',
    summary: null,
    artifact_type_name: null,
  },
  {
    relationship_id: 'r3',
    relationship_type_code: 'member_of',
    relationship_type_name: 'Member of',
    role: 'member',
    object_id: 'col-1',
    object_type: 'collection',
    title: 'Military Service',
    summary: null,
    artifact_type_name: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/connected')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: stubConnectedObjects }) });
    }
    if (url.includes('/relationships')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/media')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/sources')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    return Promise.resolve({ ok: true, json: async () => stubPerson });
  });
});

const mockOpenModal = vi.fn();
vi.mock('@/components/modals/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Stand-in for the topbar chrome: renders the page-registered Actions menu.
function TestChrome() {
  const { title, actions } = usePageActionsValue();
  if (actions.length === 0) return null;
  return <ContextActionsMenu title={title || undefined} actions={actions} />;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/people/per-1']}>
      <PageActionsProvider>
        <TestChrome />
        <Routes>
          <Route path="/people/:id" element={<PersonDetailPage />} />
        </Routes>
      </PageActionsProvider>
    </MemoryRouter>
  );
}

describe('PersonDetailPage — archive layout', () => {
  it('renders View in Tree in the identity header and no sidebar', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /view in tree/i })).toBeInTheDocument();
    expect(screen.queryByText(/generations/i)).not.toBeInTheDocument();
  });

  it('shows archive-centric stats including stories and collections', async () => {
    renderPage();
    const stats = await screen.findByLabelText('Archive object counts');
    expect(within(stats).getByText('Artifacts')).toBeInTheDocument();
    expect(within(stats).getByText('Stories')).toBeInTheDocument();
    expect(within(stats).getByText('Collections')).toBeInTheDocument();
  });

  it('lists connected stories in a Stories tab', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /stories/i }));
    expect(await screen.findByRole('link', { name: /the recipe box/i })).toBeInTheDocument();
  });

  it('groups collections in the Connected To rail', async () => {
    renderPage();
    expect(await screen.findByText('Military Service')).toBeInTheDocument();
  });
});

describe('PersonDetailPage — Add Family', () => {
  it('renders Add Family only inside the Actions menu', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Jane Doe' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /add family/i })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /actions/i }));

    expect(screen.getByRole('menuitem', { name: /add family/i })).toBeInTheDocument();
  });

  it('opens FamilyEditor pre-populated with current person as spouse1', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add family/i }));
    expect(mockOpenModal).toHaveBeenCalledWith('FamilyEditor', {
      mode: 'create',
      defaults: { spouse1_id: 'per-1' },
    });
  });

  it('navigates to new family on created result', async () => {
    mockOpenModal.mockResolvedValue({
      action: 'created',
      entityType: 'family',
      entity: {
        id: 'f-789',
        spouse1_id: 'per-1',
        spouse2_id: null,
        spouse1: null,
        spouse2: null,
        marriage_date: null,
        marriage_place: null,
      },
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add family/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/families/f-789'));
  });
});

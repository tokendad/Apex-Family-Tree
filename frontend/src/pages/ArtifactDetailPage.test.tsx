import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ArtifactDetailPage from './ArtifactDetailPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/entity-pickers/PersonPicker', () => ({
  default: ({ label }: { label: string }) => <label>{label}<input /></label>,
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canEdit: true, canDelete: true }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const artifact = {
  id: 'artifact-1',
  title: 'Family Letter',
  summary: 'Old correspondence',
  privacy_level: 'family',
  artifact_type_id: 'type-letter',
  artifact_type_name: 'Letter',
  evidence_classification_id: null,
  evidence_classification_name: null,
  original_date_text: '1910',
  creator_text: 'Ada',
  physical_location: 'Archive box',
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/v1/artifacts/artifact-1') {
      return Promise.resolve({ ok: true, json: async () => artifact });
    }
    if (url === '/api/v1/artifacts/types') {
      return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 'type-letter', name: 'Letter' }] }) });
    }
    if (url === '/api/v1/artifacts/evidence-classifications') {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    if (url === '/api/v1/relationships/objects/artifact-1/connected') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            {
              relationship_id: 'rel-1',
              relationship_type_code: 'owned_by',
              relationship_type_name: 'Owned By',
              role: 'owner',
              object_id: 'person-1',
              object_type: 'person',
              title: 'Ada Lovelace',
              summary: null,
              artifact_type_name: null,
            },
          ],
        }),
      });
    }
    if (url === '/api/v1/claims/evidence/artifact-1') {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
  global.fetch = fetchMock;
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/artifacts/artifact-1']}>
      <Routes>
        <Route path="/artifacts/:id" element={<ArtifactDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ArtifactDetailPage', () => {
  it('uses the shared archive layout and keeps artifact commands in the Actions menu', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

    expect(screen.getByLabelText('Connected archive objects')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /actions/i }));

    expect(screen.getByRole('menuitem', { name: /connect person/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /edit artifact/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete artifact/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /add claim/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /add transcript/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /record provenance/i })).toBeInTheDocument();
  });

  it('loads all connected people instead of only appears_in relationships', async () => {
    renderPage();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/relationships/objects/artifact-1/connected'));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Owned By')).toBeInTheDocument();
  });

  it('opens the person connection form from the Actions drawer', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /connect person/i }));

    expect(screen.getByRole('dialog', { name: /connect person/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/connect a person/i)).toBeInTheDocument();
  });
});

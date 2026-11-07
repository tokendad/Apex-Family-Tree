import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ArtifactDetailPage from './ArtifactDetailPage';
import { PageActionsProvider, usePageActionsValue } from '@/contexts/PageActionsContext';
import ContextActionsMenu from '@/components/archive-object/ContextActionsMenu';

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
  transcription: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const fetchMock = vi.fn();

/** Default responses for the page's own loads; tests override selectively. */
function baseFetch(url: string): Promise<unknown> {
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
    if (url === '/api/v1/relationships/types') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'rel_type_depicts_event',
              code: 'depicts_event',
              name: 'Depicts Event',
              category: 'event',
              description: 'A photo taken at an event',
              roles: [
                { role: 'artifact', allowed_object_types: ['artifact'], is_required: true },
                { role: 'event', allowed_object_types: ['event'], is_required: true },
              ],
            },
            {
              id: 'rel_type_appears_in',
              code: 'appears_in',
              name: 'Appears In',
              category: 'artifact',
              description: null,
              roles: [
                { role: 'artifact', allowed_object_types: ['artifact'], is_required: true },
                { role: 'subject', allowed_object_types: ['person'], is_required: true },
              ],
            },
            {
              id: 'rel_type_owned_by',
              code: 'owned_by',
              name: 'Owned By',
              category: 'artifact',
              description: null,
              roles: [
                { role: 'artifact', allowed_object_types: ['artifact'], is_required: true },
                { role: 'owner', allowed_object_types: ['person'], is_required: true },
              ],
            },
            {
              id: 'rel_type_donated_by',
              code: 'donated_by',
              name: 'Donated By',
              category: 'artifact',
              description: null,
              roles: [
                { role: 'artifact', allowed_object_types: ['artifact'], is_required: true },
                { role: 'donor', allowed_object_types: ['person'], is_required: true },
              ],
            },
            {
              id: 'rel_type_scanned_by',
              code: 'scanned_by',
              name: 'Scanned By',
              category: 'artifact',
              description: null,
              roles: [
                { role: 'artifact', allowed_object_types: ['artifact'], is_required: true },
                { role: 'scanner', allowed_object_types: ['person'], is_required: true },
              ],
            },
          ],
        }),
      });
    }
    if (url === '/api/v1/claims/evidence/artifact-1') {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    if (url === '/api/v1/artifacts/artifact-1/identifications') {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    if (url === '/api/v1/claims/confidence-levels') {
      return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 'confidence_probable', name: 'Probable' }] }) });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockImplementation((url: string) => baseFetch(url));
  global.fetch = fetchMock;
});

// Stand-in for the topbar chrome: renders the page-registered Actions menu.
function TestChrome() {
  const { title, actions } = usePageActionsValue();
  if (actions.length === 0) return null;
  return <ContextActionsMenu title={title || undefined} actions={actions} />;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/artifacts/artifact-1']}>
      <PageActionsProvider>
        <TestChrome />
        <Routes>
          <Route path="/artifacts/:id" element={<ArtifactDetailPage />} />
        </Routes>
      </PageActionsProvider>
    </MemoryRouter>,
  );
}

describe('ArtifactDetailPage', () => {
  it('uses the shared archive layout and keeps artifact commands in the Actions menu', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

    // Connections live in tabs rather than a side rail.
    expect(screen.queryByLabelText('Connected archive objects')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /connections/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /actions/i }));

    expect(screen.getByRole('menuitem', { name: /^connect\b/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /edit artifact/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete artifact/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /add claim/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /add transcript/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /record provenance/i })).toBeInTheDocument();
  });

  it('lists every connected object, not only people', async () => {
    renderPage();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/relationships/objects/artifact-1/connected'));

    // The rail used to show these alongside the details; they now live behind
    // the People tab, which is the only place they are listed.
    fireEvent.click(await screen.findByRole('tab', { name: /connections/i }));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Owned By/)).toBeInTheDocument();
  });

  it('opens a connection form that accepts any object type and a relationship', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^connect\b/i }));

    expect(screen.getByRole('dialog', { name: /connect/i })).toBeInTheDocument();

    // The old form could only attach a person, always as 'appears_in'. Both the
    // target and the kind of relationship are now chosen explicitly, which is
    // what lets an artifact depict an event or document a record.
    const typeSelect = screen.getByLabelText(/how are they related/i);
    expect(typeSelect).toBeInTheDocument();

    // The relationship is chosen first, because it decides which object types
    // are valid — so the picker only appears once one is selected.
    expect(screen.queryByLabelText(/what should this artifact be connected to/i)).not.toBeInTheDocument();

    fireEvent.change(typeSelect, { target: { value: 'depicts_event' } });

    expect(await screen.findByLabelText(/what should this artifact be connected to/i)).toBeInTheDocument();
  });

  it('requires confirmation before removing a connection', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: /connections/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));

    // Removal hard-deletes the relationship with no undo, so the first click
    // only arms it.
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/relationships/rel-1', { method: 'DELETE' });
    expect(screen.getByRole('button', { name: /confirm removal/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm removal/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/relationships/rel-1', { method: 'DELETE' })
    );
  });

  it('lets the confirmation be cancelled without deleting', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: /connections/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/relationships/rel-1', { method: 'DELETE' });
  });

  it('offers the seeded relationship types when connecting', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^connect\b/i }));

    const select = await screen.findByLabelText(/how are they related/i);

    // These were seeded from the start and had no way to be used: the old form
    // always wrote 'appears_in'.
    expect(within(select).getByRole('option', { name: 'Depicts Event' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Appears In' })).toBeInTheDocument();
  });

  it('sends the role names the chosen relationship defines', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/search?q=funeral&limit=50') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{ id: 'event-1', object_type: 'event', title: 'Grandpa funeral', summary: null }],
          }),
        });
      }
      if (url === '/api/v1/relationships' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'rel-new' }) });
      }
      return baseFetch(url);
    });

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^connect\b/i }));

    fireEvent.change(await screen.findByLabelText(/how are they related/i), {
      target: { value: 'depicts_event' },
    });
    fireEvent.change(await screen.findByLabelText(/what should this artifact be connected to/i), {
      target: { value: 'funeral' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Grandpa funeral/ }));
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (call) => call[0] === '/api/v1/relationships' && (call[1] as RequestInit | undefined)?.method === 'POST'
      );
      expect(post).toBeTruthy();
      const body = JSON.parse(String((post?.[1] as RequestInit).body)) as {
        relationship_type_code: string;
        members: Array<{ object_id: string; role: string }>;
      };

      // depicts_event defines roles 'artifact' and 'event'. Sending a generic
      // 'subject' here is rejected by the API with
      // "role subject does not allow object type event".
      expect(body.relationship_type_code).toBe('depicts_event');
      expect(body.members).toEqual([
        { object_id: 'artifact-1', role: 'artifact' },
        { object_id: 'event-1', role: 'event' },
      ]);
    });
  });

  describe('provenance (#24)', () => {
    it('scopes Record Provenance to ownership, donation and scanning', async () => {
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /actions/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /record provenance/i }));

      const select = await screen.findByLabelText(/how are they related/i);
      expect(within(select).getByRole('option', { name: 'Owned By' })).toBeInTheDocument();
      expect(within(select).getByRole('option', { name: 'Donated By' })).toBeInTheDocument();
      expect(within(select).getByRole('option', { name: 'Scanned By' })).toBeInTheDocument();
      // Connect's own types are not provenance and must not appear here.
      expect(within(select).queryByRole('option', { name: 'Depicts Event' })).not.toBeInTheDocument();
      expect(within(select).queryByRole('option', { name: 'Appears In' })).not.toBeInTheDocument();
    });

    it('shows the owned_by connection under the Provenance tab, not just Connections', async () => {
      renderPage();

      fireEvent.click(await screen.findByRole('tab', { name: /provenance/i }));

      expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('Owned By')).toBeInTheDocument();
    });

    it('lists identification history and lets Add Identification append an entry', async () => {
      const entries = [
        {
          id: 'ident-1',
          identified_person_id: null,
          identified_person_name: null,
          identifier_person_id: null,
          identifier_person_name: null,
          confidence_level_id: 'confidence_probable',
          confidence_level_name: 'Probable',
          note: 'Probably Grade 6, by the classroom decor.',
          created_at: '2026-06-01 12:00:00',
        },
      ];

      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        if (url === '/api/v1/artifacts/artifact-1/identifications' && !init) {
          return Promise.resolve({ ok: true, json: async () => ({ data: entries }) });
        }
        if (url === '/api/v1/artifacts/artifact-1/identifications' && init?.method === 'POST') {
          const added = {
            id: 'ident-2',
            identified_person_id: null,
            identified_person_name: null,
            identifier_person_id: null,
            identifier_person_name: null,
            confidence_level_id: null,
            confidence_level_name: null,
            note: 'A second guess.',
            created_at: '2026-06-02 12:00:00',
          };
          entries.push(added);
          return Promise.resolve({ ok: true, status: 201, json: async () => added });
        }
        return baseFetch(url);
      });

      renderPage();

      fireEvent.click(await screen.findByRole('tab', { name: /provenance/i }));
      expect(await screen.findByText('Probably Grade 6, by the classroom decor.')).toBeInTheDocument();

      fireEvent.click(await screen.findByRole('button', { name: /actions/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /add identification/i }));

      const note = await screen.findByLabelText(/what was identified/i);
      fireEvent.change(note, { target: { value: 'A second guess.' } });
      fireEvent.click(screen.getByRole('button', { name: /^add identification$/i }));

      await waitFor(() => {
        const post = fetchMock.mock.calls.find(
          (call) => call[0] === '/api/v1/artifacts/artifact-1/identifications' && (call[1] as RequestInit | undefined)?.method === 'POST',
        );
        expect(post).toBeTruthy();
        expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({ note: 'A second guess.' });
      });

      // The drawer closes and the new entry joins the list -- no edit/delete
      // affordance anywhere, since the table itself forbids both.
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByText('A second guess.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^edit$/i, hidden: true })).not.toBeInTheDocument();
    });

    it('requires a note before Add Identification can be submitted', async () => {
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /actions/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /add identification/i }));

      await screen.findByLabelText(/what was identified/i);
      expect(screen.getByRole('button', { name: /^add identification$/i })).toBeDisabled();
    });
  });
});

describe('ArtifactDetailPage — the artifact\'s own file (#22)', () => {
  /** Serve the page's normal payload but with the given files attached. */
  function fetchWithFiles(files: unknown[]) {
    return (url: string) => {
      if (url === '/api/v1/artifacts/artifact-1') {
        return Promise.resolve({ ok: true, json: async () => ({ ...artifact, files }) });
      }
      return baseFetch(url);
    };
  }

  it('shows an image artifact in place', async () => {
    fetchMock.mockImplementation(fetchWithFiles([
      {
        id: 'f1',
        file_role: 'primary',
        storage_path: '/media/ancestry/photos/scan.jpg',
        original_filename: 'scan.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 320224,
      },
    ]));

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

    const img = await screen.findByAltText('Family Letter');
    // Served from artifact_files, not from the media endpoint.
    expect(img).toHaveAttribute('src', '/api/v1/artifacts/artifact-1/file');
    expect(screen.getByText(/scan\.jpg/)).toBeInTheDocument();
    // 320224 bytes rendered for a human.
    expect(screen.getByText(/313 KB/)).toBeInTheDocument();
  });

  it('offers a download for a document rather than rendering it', async () => {
    fetchMock.mockImplementation(fetchWithFiles([
      {
        id: 'f2',
        file_role: 'primary',
        storage_path: '/media/ancestry/docs/will.pdf',
        original_filename: 'will.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1048576,
      },
    ]));

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

    const link = await screen.findByRole('link', { name: /download will\.pdf/i });
    expect(link).toHaveAttribute('href', '/api/v1/artifacts/artifact-1/file');
    expect(screen.queryByAltText('Family Letter')).toBeNull();
  });

  it('says so plainly when an artifact has no file attached', async () => {
    fetchMock.mockImplementation(fetchWithFiles([]));

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

    expect(await screen.findByText(/no file is attached to this artifact/i)).toBeInTheDocument();
  });

  it('prefers the primary file over the other roles', async () => {
    fetchMock.mockImplementation(fetchWithFiles([
      { id: 'f3', file_role: 'thumbnail', storage_path: '/t.jpg', original_filename: 't.jpg', mime_type: 'image/jpeg', size_bytes: 10 },
      { id: 'f4', file_role: 'primary', storage_path: '/p.jpg', original_filename: 'primary.jpg', mime_type: 'image/jpeg', size_bytes: 20 },
    ]));

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

    expect(await screen.findByText(/primary\.jpg/)).toBeInTheDocument();
  });
  /* ── Transcript ──
     The field existed in the schema, the API and the search index, and had no
     field in the UI: "Add Transcript" opened a drawer that saved nothing, so
     transcripts were typed into Notes instead. */
  describe('transcript', () => {
    const transcribed = {
      ...artifact,
      transcription: 'Dear auntie,\n\nI am seven years old.\n\nLove from me',
    };

    it('shows the transcript with the line breaks it was typed with', async () => {
      fetchMock.mockImplementation((url: string) =>
        url === '/api/v1/artifacts/artifact-1'
          ? Promise.resolve({ ok: true, json: async () => transcribed })
          : baseFetch(url));

      renderPage();
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

      fireEvent.click(await screen.findByRole('tab', { name: /transcript/i }));

      // Asserted as one string rather than per line: the whitespace is the
      // point, and `pre-wrap` is what keeps it.
      const body = await screen.findByText(/I am seven years old/);
      expect(body.textContent).toBe(transcribed.transcription);
    });

    it('offers to start one when there is none', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

      fireEvent.click(await screen.findByRole('tab', { name: /transcript/i }));

      expect(await screen.findByText(/no transcript yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add transcript/i })).toBeInTheDocument();
    });

    /* The Actions entry used to open a drawer that explained what transcript
       editing would one day do. It now puts the caret in the editor. */
    it('saves what is typed to the transcription field', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /actions/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /add transcript/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const box = await screen.findByLabelText(/transcript/i);
      fireEvent.change(box, { target: { value: 'Dear auntie,\n\nLove from me' } });

      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        if (url === '/api/v1/artifacts/artifact-1' && init?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ...artifact, transcription: 'Dear auntie,\n\nLove from me' }),
          });
        }
        return baseFetch(url);
      });

      fireEvent.click(screen.getByRole('button', { name: /save transcript/i }));

      await waitFor(() => {
        const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
        expect(put).toBeTruthy();
        expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({
          transcription: 'Dear auntie,\n\nLove from me',
        });
      });

      /* Asserted by what the editor leaves behind rather than by the text:
         React mirrors a controlled textarea's value into its defaultValue, so
         a findByText for the transcript matches the textarea itself and passes
         whether or not the editor closed. */
      await waitFor(() => expect(screen.queryByRole('button', { name: /save transcript/i })).toBeNull());
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });

    /* The draft lives in the same form object the Details tab saves from, so
       an abandoned transcript must not ride along with the next edit there. */
    it('drops an abandoned draft instead of carrying it into the next save', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Family Letter' })).toBeInTheDocument());

      fireEvent.click(await screen.findByRole('tab', { name: /transcript/i }));
      fireEvent.click(await screen.findByRole('button', { name: /add transcript/i }));
      fireEvent.change(await screen.findByLabelText(/transcript/i), { target: { value: 'half a letter' } });
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      fireEvent.click(screen.getByRole('button', { name: /actions/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /edit artifact/i }));
      fireEvent.click(await screen.findByRole('button', { name: /save artifact/i }));

      await waitFor(() => {
        const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
        expect(put).toBeTruthy();
        expect(JSON.parse((put![1] as RequestInit).body as string).transcription).toBeNull();
      });
    });
  });
});

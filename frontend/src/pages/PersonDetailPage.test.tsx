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

/* Hoisted so a test can flip a permission: the claim drawer's Edit affordance
   is gated on canEdit, which the rest of this file deliberately leaves off. */
const perms = vi.hoisted(() => ({ canCreate: true, canEdit: false, canDelete: false }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => perms,
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
  /* null, not []. persons.notes is a TEXT column -- 245 rows hold text and 112
     hold NULL, never an array -- and the page types it `string | null`. The
     old `[]` was truthy, so an empty Notes section rendered for a person who
     had none; nothing asserted on it, so it went unnoticed. */
  notes: null,
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

const stubCollectionMembership = [
  {
    id: 'col-1',
    title: 'Military Service',
    summary: null,
    cover_artifact_id: null,
    item_id: 'ci-1',
    caption: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/collections/for-object/')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: stubCollectionMembership }) });
    }
    if (url.includes('/collections/for-object/')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: stubCollectionMembership }) });
    }
    if (url.includes('/claims/subject/')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
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

function renderPage(entry = '/people/per-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PageActionsProvider>
        <TestChrome />
        <Routes>
          <Route path="/people/:id" element={<PersonDetailPage />} />
        </Routes>
      </PageActionsProvider>
    </MemoryRouter>
  );
}

/* Issue #51: research notes on this archive run to thousands of characters --
   9,274 on the longest -- and the identity header rendered them unclamped,
   pushing the stats, the tabs and every fact below the fold. */
describe('PersonDetailPage — research notes (issue #51)', () => {
  const LONG_NOTE =
    'HIS NAME IS PRESTON, AND "MARLOW" IS WITHDRAWN. ' + 'The register says so. '.repeat(200);

  function renderWithNotes() {
    const spy = vi.spyOn(globalThis, 'fetch' as never) as unknown as ReturnType<typeof vi.fn>;
    spy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/connected-objects'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources'))
        return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ ...stubPerson, notes: LONG_NOTE }) });
    });
    return renderPage();
  }

  it('keeps the notes out of the identity header', async () => {
    renderWithNotes();
    await screen.findByRole('button', { name: /view in tree/i });
    /* The header is where #51 reported the overflow. Whatever else renders the
       note, the <h1>'s own section must not. */
    const header = screen.getByRole('heading', { level: 1 }).closest('header');
    expect(header).not.toBeNull();
    expect(header?.textContent ?? '').not.toContain('MARLOW');
  });

  it('shows a clamped preview on Overview that points at the Research tab', async () => {
    renderWithNotes();
    const preview = await screen.findByText(/MARLOW/);
    /* Clamped by CSS, not truncated in the DOM: find-in-page and screen
       readers still reach the whole note. */
    expect(preview.className).toMatch(/notesPreview/);
    expect(preview.textContent).toBe(LONG_NOTE);
    expect(screen.getByRole('button', { name: /read all/i })).toBeInTheDocument();
  });

  it('shows the whole note on the Research tab', async () => {
    renderWithNotes();
    await screen.findByRole('button', { name: /view in tree/i });
    fireEvent.click(screen.getByRole('tab', { name: /research/i }));
    const heading = await screen.findByRole('heading', { name: 'Research', level: 2 });
    const section = heading.closest('section');
    /* #51's guarantee is that nothing is truncated in the DOM. The note is now
       split into a heading and a body (#52), so its text is spread across
       elements: comparing with whitespace removed proves no prose was dropped
       without asserting how the note is divided up. */
    const squash = (text: string) => text.replace(/\s+/g, '');
    expect(squash(section?.textContent ?? '')).toContain(squash(LONG_NOTE));
    /* Unclamped here -- this tab is where the long text belongs. */
    expect(within(section as HTMLElement).getByText(/MARLOW/).className).not.toMatch(/notesPreview/);
  });

  it('says so plainly when a person has no research notes', async () => {
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });
    fireEvent.click(screen.getByRole('tab', { name: /research/i }));
    expect(await screen.findByText(/no research notes recorded/i)).toBeInTheDocument();
  });
});

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

  it('lists collections by name under the Collections tab', async () => {
    renderPage();

    // Membership is read from collection_items, not from the relationship
    // graph, so the tab reflects what the collection actually contains.
    fireEvent.click(await screen.findByRole('tab', { name: /collections/i }));

    expect(await screen.findByText('Military Service')).toBeInTheDocument();
    expect(screen.queryByText('Connected To')).not.toBeInTheDocument();
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

describe('PersonDetailPage — events vs attributes', () => {
  // An occupation is not something that happened on a date; it describes the
  // person. It belongs in Facts & Attributes, not the chronological timeline.
  const personWithAttributes = {
    ...stubPerson,
    events: [
      { id: 'e1', event_type: 'birth', event_date: '5 JAN 1922', event_place: 'Massachusetts', description: null },
      { id: 'e2', event_type: 'occupation', event_date: '1982', event_place: null, description: 'Segment Treater' },
      { id: 'e3', event_type: 'residence', event_date: '1930', event_place: 'Worcester', description: null },
      { id: 'e4', event_type: 'death', event_date: '16 JUN 1990', event_place: null, description: null },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/connected')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => personWithAttributes });
    });
  });

  it('counts only occurrences under Events, and lists attributes separately', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: /timeline/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));

    const timeline = await screen.findByRole('list', { name: /life events timeline/i });
    expect(within(timeline).getByText('Birth')).toBeInTheDocument();
    expect(within(timeline).getByText('Death')).toBeInTheDocument();
    // The two attributes must not be interleaved into the timeline.
    expect(within(timeline).queryByText('Occupation')).not.toBeInTheDocument();
    expect(within(timeline).queryByText('Residence')).not.toBeInTheDocument();

    const attributes = screen.getByRole('heading', { name: /facts & attributes/i });
    expect(attributes).toBeInTheDocument();
    expect(screen.getByText('Segment Treater')).toBeInTheDocument();
    expect(screen.getByText('Occupation')).toBeInTheDocument();
    expect(screen.getByText('Residence')).toBeInTheDocument();
  });

  /* An event's photographs hang off the event, not off the person -- a wake
     with twenty pictures of other people is not twenty portraits of him. The
     timeline is the way through to them, so the name has to be a link. */
  it('links each event to its own page', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: /timeline/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));

    const timeline = await screen.findByRole('list', { name: /life events timeline/i });
    expect(within(timeline).getByRole('link', { name: 'Birth' })).toHaveAttribute('href', '/events/e1');
    expect(within(timeline).getByRole('link', { name: 'Death' })).toHaveAttribute('href', '/events/e4');
  });

  it('links them from the overview summary too', async () => {
    renderPage();

    const summary = await screen.findByRole('list', { name: /key life events/i });
    expect(within(summary).getByRole('link', { name: 'Birth' })).toHaveAttribute('href', '/events/e1');
  });
});

describe('PersonDetailPage — artifacts and attribute dates', () => {
  /**
   * person_media and the archive model describe the same photographs. Before
   * they were merged the page showed two sections, and once migration 063
   * backfilled the relationships every photo appeared twice -- a thumbnail in
   * "Media" and a placeholder card in "Connected Artifacts".
   */
  it('lists a photograph once when both link tables know about it', async () => {
    const photo = {
      id: 'artifact-1',
      filename: 'grade6.jpg',
      url: '/api/v1/media/artifact-1',
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/collections/for-object/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }
      if (url.includes('/connected')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: stubConnectedObjects }) });
      }
      if (url.includes('/relationships')) return Promise.resolve({ ok: true, json: async () => [] });
      // Same id as the connected artifact above: one photograph, two tables.
      if (url.includes('/media')) return Promise.resolve({ ok: true, json: async () => [photo] });
      if (url.includes('/sources')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => stubPerson });
    });

    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Jane Doe' });

    fireEvent.click(await screen.findByRole('tab', { name: /artifacts/i }));

    await screen.findByRole('link', { name: /wwii draft letter/i });
    expect(screen.getAllByText('WWII Draft Letter')).toHaveLength(1);
    // And it is shown with its own image rather than a placeholder glyph.
    expect(document.querySelector('img[src="/api/v1/media/artifact-1/thumbnail"]')).toBeTruthy();
  });

  it('shows photographs on the overview, not placeholder glyphs', async () => {
    const photo = { id: 'artifact-1', filename: 'grade1.jpg', url: '/api/v1/media/artifact-1' };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/collections/for-object/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }
      if (url.includes('/connected')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: stubConnectedObjects }) });
      }
      if (url.includes('/relationships')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/media')) return Promise.resolve({ ok: true, json: async () => [photo] });
      if (url.includes('/sources')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => stubPerson });
    });

    renderPage();
    // Recent Artifacts is on the default Overview tab.
    await screen.findByText('Recent Artifacts');

    await waitFor(() => {
      expect(document.querySelector('img[src="/api/v1/media/artifact-1/thumbnail"]')).toBeTruthy();
    });
  });

  it('renders an attribute date span readably, not as raw GEDCOM', async () => {
    const personWithSchooling = {
      ...stubPerson,
      events: [
        {
          id: 'ev-edu',
          event_type: 'education',
          event_date: 'BET 1985 AND 1992',
          event_date_qualifier: 'between',
          event_place: 'Worcester, Massachusetts, USA',
          description: 'Nelson Place School',
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/collections/for-object/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }
      if (url.includes('/connected')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (url.includes('/relationships')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/media')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/sources')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => personWithSchooling });
    });

    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Jane Doe' });
    // Facts & Attributes sits alongside Events under the Timeline tab.
    fireEvent.click(await screen.findByRole('tab', { name: /timeline/i }));
    await screen.findByText('Nelson Place School');

    expect(screen.getByText(/1985–1992/)).toBeInTheDocument();
    expect(screen.queryByText(/BET 1985 AND 1992/)).toBeNull();
  });
});

describe('PersonDetailPage — half- and step-siblings', () => {
  /* The reported case: Raymond Jr's panel showed only his parents' three
     children, and nothing said his father's two by another wife existed. */
  const relationships = [
    {
      family_id: 'f-1',
      type: 'child_family',
      role: 'child',
      spouse1: { id: 'p-dad', given_name: 'Raymond', surname: 'LeFort' },
      spouse2: { id: 'p-mum', given_name: 'Eunice', surname: 'LeFort' },
      children: [
        { id: 'fm-1', family_id: 'f-1', person_id: 'per-1', given_name: 'Jane', surname: 'Doe', role: 'child' },
        { id: 'fm-2', family_id: 'f-1', person_id: 'p-rich', given_name: 'Richard', surname: 'LeFort', role: 'child' },
        { id: 'fm-3', family_id: 'f-1', person_id: 'p-sandy', given_name: 'Sandy', surname: 'LeFort', role: 'adopted' },
      ],
      step_parents: [
        {
          via: { id: 'p-dad', given_name: 'Raymond', surname: 'LeFort' },
          people: [{ id: 'p-betty', given_name: 'Betty', surname: 'Mercier' }],
        },
      ],
      half_siblings: [
        {
          via: { id: 'p-dad', given_name: 'Raymond', surname: 'LeFort' },
          children: [
            { id: 'fm-4', family_id: 'f-2', person_id: 'p-harold', given_name: 'Harold', surname: 'Blake', role: 'child' },
            { id: 'fm-5', family_id: 'f-2', person_id: 'p-lucinda', given_name: 'Lucinda', surname: 'Hecker', role: 'child' },
          ],
        },
      ],
      step_siblings: [
        {
          via: { id: 'p-dad', given_name: 'Raymond', surname: 'LeFort' },
          step_parent: { id: 'p-betty', given_name: 'Betty', surname: 'Mercier' },
          children: [
            { id: 'fm-6', family_id: 'f-3', person_id: 'p-step', given_name: 'Paul', surname: 'Mercier', role: 'step' },
          ],
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/connected')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }
      if (url.includes('/relationships')) {
        return Promise.resolve({ ok: true, json: async () => relationships });
      }
      if (url.includes('/media') || url.includes('/sources') || url.includes('/collections/')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => stubPerson });
    });
  });

  async function openFamilyTab() {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /family/i }));
  }

  it('lists half-siblings apart from the siblings, named after the shared parent', async () => {
    await openFamilyTab();

    expect(await screen.findByText(/^Siblings \(2\)$/)).toBeInTheDocument();

    /* The label has to say which parent it runs through -- the step-parent row
       says "via Raymond LeFort" too, so this is read off the heading itself. */
    const heading = screen.getByText('Half-siblings (2)').parentElement!;
    expect(heading.textContent).toContain('via Raymond LeFort');
    expect(screen.getByRole('link', { name: /harold blake/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lucinda hecker/i })).toBeInTheDocument();
  });

  /* A step-sibling shares no parent with the subject, so the label has to say
     both whose spouse the connection runs through and who that spouse is. */
  it('lists step-siblings with the parent and the step-parent', async () => {
    await openFamilyTab();

    expect(await screen.findByText('Step-siblings (1)')).toBeInTheDocument();
    expect(screen.getByText('via Raymond LeFort, with Betty Mercier')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /paul mercier/i })).toBeInTheDocument();
  });

  /* role already carried adopted | foster | step and the panel showed none of
     it, so an adopted child read as a birth child. */
  it('marks a non-birth role on the name and leaves birth children unmarked', async () => {
    await openFamilyTab();

    expect(await screen.findByRole('link', { name: /sandy lefort adopted/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Richard LeFort' })).toBeInTheDocument();
  });

  it('leaves the subject out of their own sibling list', async () => {
    await openFamilyTab();

    await screen.findByText(/^Siblings \(2\)$/);
    expect(screen.queryByRole('link', { name: /jane doe/i })).not.toBeInTheDocument();
  });


  /* A parent's later marriage left no trace on the page at all, even when the
     new spouse brought no children of their own. */
  it('lists a step-parent below the parents, named after the parent they married', async () => {
    await openFamilyTab();

    expect(await screen.findByText('Step-parents (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Betty Mercier' })).toBeInTheDocument();

    /* Below the parents, not among them -- Betty is not an ancestor. */
    const parents = screen.getByText('Parents').parentElement!;
    expect(parents.textContent).not.toContain('Betty');
  });
});

/* Issue #52: the Claims tab rendered a placeholder saying the feature was not
   wired up, while the Glossary and FAQ described it to users in detail. */
describe('PersonDetailPage claims tab', () => {
  const claims = [
    {
      id: 'claim-1',
      statement: 'Her father is Preston, not Marlow.',
      claim_type: 'parentage',
      date_text: null,
      status: 'conflicted' as const,
      confidence_level_id: 'confidence_confirmed',
      confidence_level_name: 'Confirmed',
      confidence_score: 95,
      evidence_count: 5,
      supporting_count: 4,
      contradicting_count: 1,
      research_section: null,
    },
    {
      id: 'claim-2',
      statement: 'Her birth year is 1904.',
      claim_type: 'date',
      date_text: '20 July 1904',
      status: 'open' as const,
      confidence_level_id: 'confidence_disputed',
      confidence_level_name: 'Disputed',
      confidence_score: 40,
      evidence_count: 0,
      supporting_count: 0,
      contradicting_count: 0,
      research_section: null,
    },
  ];

  function mockWithClaims(data: unknown[]) {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/claims/subject/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data }) });
      }
      if (url.includes('/connected')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => stubPerson });
    });
  }

  async function openClaimsTab() {
    renderPage();
    await waitFor(() => expect(screen.getByRole('tab', { name: /claims/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /claims/i }));
  }

  it('shows each claim with its confidence, status and evidence split by role', async () => {
    mockWithClaims(claims);
    await openClaimsTab();

    expect(await screen.findByRole('link', { name: 'Her father is Preston, not Marlow.' })).toBeInTheDocument();
    expect(screen.getByText('Confirmed · 95')).toBeInTheDocument();

    /* Confirmed AND conflicted together is the point of the feature: the
       records disagree, the conclusion does not. */
    expect(screen.getByText('Records conflict')).toBeInTheDocument();
    expect(screen.getByText('4 support · 1 contradicts')).toBeInTheDocument();
  });

  it('colours the pill from the confidence level rather than the status', async () => {
    mockWithClaims(claims);
    await openClaimsTab();

    const confirmed = await screen.findByText('Confirmed · 95');
    expect(confirmed).toHaveAttribute('data-confidence', 'confirmed');
    expect(screen.getByText('Disputed · 40')).toHaveAttribute('data-confidence', 'disputed');
  });

  it('says so plainly when a claim has no evidence yet', async () => {
    mockWithClaims(claims);
    await openClaimsTab();

    expect(await screen.findByText('No evidence attached yet')).toBeInTheDocument();
  });

  it('counts evidence that neither supports nor contradicts', async () => {
    mockWithClaims([{ ...claims[0], evidence_count: 6, supporting_count: 4, contradicting_count: 1 }]);
    await openClaimsTab();

    /* A mention is still a record somebody attached; it must not vanish from a
       tally that claims to total the evidence. */
    expect(await screen.findByText('4 support · 1 contradicts · 1 other')).toBeInTheDocument();
  });

  it('falls back to a neutral pill for an ungraded claim', async () => {
    mockWithClaims([{
      ...claims[0],
      confidence_level_id: null,
      confidence_level_name: null,
      confidence_score: null,
    }]);
    await openClaimsTab();

    const pill = await screen.findByText('Unknown');
    expect(pill).toHaveAttribute('data-confidence', 'unknown');
  });

  it('no longer claims the feature is unwired when the person has no claims', async () => {
    mockWithClaims([]);
    await openClaimsTab();

    expect(await screen.findByText(/No claims recorded for/i)).toBeInTheDocument();
    expect(screen.queryByText(/not wired into this page yet/i)).not.toBeInTheDocument();
  });
});

/* Issue #52, step 4. A claim has to be able to point at the passage that argues
   it. The notes already open their paragraphs with a capitalised sentence, so
   the headings are read off the prose rather than stored. */
describe('PersonDetailPage research sections', () => {
  const SECTIONED_NOTE = [
    'Mother of Rowan Avery (Hadley) Marlow.',
    "HER FATHER'S NAME WAS NEVER IN DOUBT AFTER ALL. Her own baptism says PRESTON.",
    'HER BIRTH MOVED BY A DAY. Birth 25 June, baptism 26 June.',
  ].join('\n\n');

  const FATHER_SLUG = 'note-her-fathers-name-was-never-in-doubt-after-all';

  function mockNote(notes: string) {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/claims/subject/') || url.includes('/connected') || url.includes('/collections/for-object/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources'))
        return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ ...stubPerson, notes }) });
    });
  }

  async function openResearch(entry?: string) {
    renderPage(entry);
    await screen.findByRole('button', { name: /view in tree/i });
    if (!entry) fireEvent.click(screen.getByRole('tab', { name: /research/i }));
  }

  it('renders each capitalised opening sentence as its own heading', async () => {
    mockNote(SECTIONED_NOTE);
    await openResearch();

    expect(await screen.findByRole('heading', { name: "HER FATHER'S NAME WAS NEVER IN DOUBT AFTER ALL.", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'HER BIRTH MOVED BY A DAY.', level: 3 })).toBeInTheDocument();
    // The unheaded opening paragraph is still prose, not a heading.
    expect(screen.getByText('Mother of Rowan Avery (Hadley) Marlow.')).toBeInTheDocument();
  });

  it('lists the sections in a contents nav, shouting softened', async () => {
    mockNote(SECTIONED_NOTE);
    await openResearch();

    const toc = await screen.findByRole('navigation', { name: /sections of this note/i });
    /* A dozen capitalised lines is unreadable as a contents list, so the nav
       softens them while the section itself keeps the original capitals. */
    expect(within(toc).getByRole('link', { name: "Her father's name was never in doubt after all" })).toHaveAttribute('href', `#${FATHER_SLUG}`);
    expect(within(toc).getByRole('link', { name: 'Her birth moved by a day' })).toBeInTheDocument();
  });

  it('switches to the Research tab and marks the section when arriving on its anchor', async () => {
    mockNote(SECTIONED_NOTE);
    await openResearch(`/people/per-1#${FATHER_SLUG}`);

    /* Landing on Overview would hide the very passage the link was for. */
    const flag = await screen.findByText(/linked from a claim/i);
    expect(flag).toBeInTheDocument();

    const marked = document.getElementById(FATHER_SLUG);
    expect(marked).toHaveAttribute('data-linked', 'true');
    expect(document.getElementById('note-her-birth-moved-by-a-day')).not.toHaveAttribute('data-linked');
  });

  it('says the passage is gone rather than scrolling to the wrong one', async () => {
    mockNote(SECTIONED_NOTE);
    await openResearch('/people/per-1#note-a-heading-that-was-rewritten-away');

    expect(await screen.findByText(/no longer in this note/i)).toBeInTheDocument();
    // The note is still shown in full underneath.
    expect(screen.getByRole('heading', { name: 'HER BIRTH MOVED BY A DAY.', level: 3 })).toBeInTheDocument();
    expect(screen.queryByText(/linked from a claim/i)).not.toBeInTheDocument();
  });

  it('offers no contents nav for a note with nothing to navigate', async () => {
    mockNote('Just one plain paragraph of prose, with no headings in it at all.');
    await openResearch();

    await screen.findByRole('heading', { name: 'Research', level: 2 });
    expect(screen.queryByRole('navigation', { name: /sections of this note/i })).not.toBeInTheDocument();
  });
});

/* Issue #52. The card carries the conclusion and points at the argument; the
   prose stays on the Research tab. These are the links that join the two. */
describe('PersonDetailPage claim argument links', () => {
  const NOTE = [
    "HER FATHER'S NAME WAS NEVER IN DOUBT AFTER ALL. Her own baptism says PRESTON.",
    'HER BIRTH MOVED BY A DAY. Birth 25 June, baptism 26 June.',
  ].join('\n\n');

  const FATHER_SLUG = 'note-her-fathers-name-was-never-in-doubt-after-all';

  const baseClaim = {
    id: 'claim-1',
    statement: 'Her father is Preston, not Marlow.',
    claim_type: 'parentage',
    status: 'conflicted' as const,
    confidence_level_id: 'confidence_confirmed',
    confidence_level_name: 'Confirmed',
    confidence_score: 95,
    evidence_count: 5,
    supporting_count: 4,
    contradicting_count: 1,
    research_section: null as string | null,
  };

  function mockClaim(research_section: string | null) {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/claims/subject/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [{ ...baseClaim, research_section }] }) });
      if (url.includes('/connected') || url.includes('/collections/for-object/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources'))
        return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ ...stubPerson, notes: NOTE }) });
    });
  }

  async function openClaims() {
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });
    fireEvent.click(screen.getByRole('tab', { name: /claims/i }));
  }

  it('links to the passage and names it', async () => {
    mockClaim(FATHER_SLUG);
    await openClaims();

    const link = await screen.findByRole('link', { name: /read the argument/i });
    // Resolved against the person's route, so the link survives being copied.
    expect(link).toHaveAttribute('href', `/people/per-1#${FATHER_SLUG}`);
    /* Named so the reader knows where it goes before clicking, and softened
       out of the prose's capitals. */
    expect(screen.getByText(/Her father's name was never in doubt after all/)).toBeInTheDocument();
  });

  it('carries the conclusion but never the argument itself', async () => {
    mockClaim(FATHER_SLUG);
    await openClaims();

    await screen.findByRole('link', { name: /read the argument/i });
    const card = screen.getByRole('heading', { name: 'Her father is Preston, not Marlow.' }).closest('article');
    expect(card).not.toBeNull();
    // The prose belongs to the Research tab, not to the card.
    expect(card?.textContent).not.toContain('Her own baptism says PRESTON');
  });

  it('follows the link through to the marked passage', async () => {
    mockClaim(FATHER_SLUG);
    await openClaims();

    fireEvent.click(await screen.findByRole('link', { name: /read the argument/i }));

    /* The whole point of the round trip: the reader lands on the argument, not
       at the top of a note running to thousands of characters. */
    expect(await screen.findByText(/linked from a claim/i)).toBeInTheDocument();
    expect(document.getElementById(FATHER_SLUG)).toHaveAttribute('data-linked', 'true');
  });

  it('offers the note top when no anchor is recorded, and says so', async () => {
    mockClaim(null);
    await openClaims();

    expect(await screen.findByRole('button', { name: /open the research note/i })).toBeInTheDocument();
    expect(screen.getByText(/no section anchor recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /read the argument/i })).not.toBeInTheDocument();
  });

  it('admits on the card when the passage has been rewritten away', async () => {
    mockClaim('note-a-heading-that-no-longer-exists');
    await openClaims();

    /* Better than discovering it only after the jump. */
    expect(await screen.findByText(/passage no longer in this note/i)).toBeInTheDocument();
  });
});

/* Issue #52, step 5: a disputed date must not look like a settled one, and a
   settled one must stay unmarked -- otherwise every date carries a badge and
   none of them means anything. */
describe('PersonDetailPage confidence markers', () => {
  const dateClaim = {
    id: 'claim-date',
    statement: 'Her birth year is 1904.',
    claim_type: 'date',
    date_text: '20 July 1904',
    status: 'open' as const,
    confidence_level_id: 'confidence_disputed',
    confidence_level_name: 'Disputed',
    confidence_score: 40,
    evidence_count: 0,
    supporting_count: 0,
    contradicting_count: 0,
    research_section: null as string | null,
  };

  const events = [
    { id: 'ev-b', event_type: 'birth', event_date: '20 JUL 1904', event_place: 'Cambridge', description: null },
    { id: 'ev-d', event_type: 'death', event_date: '3 MAR 2003', event_place: null, description: null },
  ];

  function mock(claims: unknown[]) {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/claims/subject/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: claims }) });
      if (url.includes('/connected') || url.includes('/collections/for-object/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources'))
        return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ ...stubPerson, events }) });
    });
  }

  it('marks the date an unsettled claim governs, and leaves the other alone', async () => {
    mock([dateClaim]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    const marked = await screen.findByText('20 JUL 1904');
    expect(marked).toHaveAttribute('data-unsettled', 'true');
    /* The death date is governed by nothing and must stay plain. */
    expect(screen.getByText('3 MAR 2003')).not.toHaveAttribute('data-unsettled');
  });

  it('adds no marker at all for a Confirmed claim', async () => {
    mock([{ ...dateClaim, confidence_level_id: 'confidence_confirmed', confidence_level_name: 'Confirmed', confidence_score: 95 }]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    expect(await screen.findByText('20 JUL 1904')).not.toHaveAttribute('data-unsettled');
    // And the Overview band does not appear when nothing is open.
    expect(screen.queryByRole('heading', { name: /not settled/i })).not.toBeInTheDocument();
  });

  it('treats Rejected as settled too', async () => {
    mock([{ ...dateClaim, confidence_level_id: 'confidence_rejected', confidence_level_name: 'Rejected', confidence_score: 0 }]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    /* Rejected has been looked into and ruled out. Marking the date would
       suggest the question is still open. */
    expect(await screen.findByText('20 JUL 1904')).not.toHaveAttribute('data-unsettled');
  });

  it('lists an unsettled claim that governs no date, rather than marking a date it does not own', async () => {
    const medical = { ...dateClaim, id: 'claim-med', claim_type: 'medical', date_text: null, statement: 'He did not die of typhoid fever.' };
    mock([medical]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    // It surfaces in the band...
    expect(await screen.findByRole('heading', { name: /not settled/i })).toBeInTheDocument();
    expect(screen.getByText('He did not die of typhoid fever.')).toBeInTheDocument();
    // ...and marks neither date, because it governs neither.
    expect(screen.getByText('20 JUL 1904')).not.toHaveAttribute('data-unsettled');
    expect(screen.getByText('3 MAR 2003')).not.toHaveAttribute('data-unsettled');
  });

  it('does not match a date claim to an event of a different year', async () => {
    mock([{ ...dateClaim, date_text: '1890' }]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    expect(await screen.findByText('20 JUL 1904')).not.toHaveAttribute('data-unsettled');
  });

  /* Two events four days apart is the case the year heuristic cannot settle,
     and the reason a claim can now name the event it governs. */
  const sameYearEvents = [
    { id: 'ev-b', event_type: 'birth', event_date: '20 JUL 1904', event_place: 'Cambridge', description: null },
    { id: 'ev-bap', event_type: 'baptism', event_date: '24 JUL 1904', event_place: null, description: null },
  ];

  function mockSameYear(claims: unknown[]) {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/claims/subject/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: claims }) });
      if (url.includes('/connected') || url.includes('/collections/for-object/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources'))
        return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ ...stubPerson, events: sameYearEvents }) });
    });
  }

  it('marks the one event a linked claim names, and not its neighbour', async () => {
    mockSameYear([{ ...dateClaim, governs_object_id: 'ev-bap' }]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    expect(await screen.findByText('24 JUL 1904')).toHaveAttribute('data-unsettled', 'true');
    /* The birth is four days earlier in the same year, so the heuristic would
       have marked it -- and marked it instead, since it comes first. */
    expect(screen.getByText('20 JUL 1904')).not.toHaveAttribute('data-unsettled');
  });

  it('still matches by year when the claim names nothing', async () => {
    /* The eleven claims a migration backfilled are all like this, so the old
       behaviour has to survive unchanged. */
    mockSameYear([{ ...dateClaim, governs_object_id: null }]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    expect(await screen.findByText('20 JUL 1904')).toHaveAttribute('data-unsettled', 'true');
  });

  it('marks nothing for a link to an event the person no longer has', async () => {
    mockSameYear([{ ...dateClaim, governs_object_id: 'ev-deleted' }]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    /* A claim that names an event is not guessed at as well. Falling back would
       mark a date nobody pointed it at. */
    expect(await screen.findByText('20 JUL 1904')).not.toHaveAttribute('data-unsettled');
    expect(screen.getByText('24 JUL 1904')).not.toHaveAttribute('data-unsettled');
  });

  it('keeps a settled claim off the date it names', async () => {
    mockSameYear([{
      ...dateClaim,
      governs_object_id: 'ev-bap',
      confidence_level_id: 'confidence_confirmed',
      confidence_level_name: 'Confirmed',
      confidence_score: 95,
    }]);
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });

    /* An explicit link says which fact, not that the fact is in doubt. */
    expect(await screen.findByText('24 JUL 1904')).not.toHaveAttribute('data-unsettled');
  });
});

/* Issue #52, step 6: the drawer. Two tests for the two round trips -- create
   and edit -- because that is what matters; the fields themselves are plumbing. */
describe('PersonDetailPage claim drawer', () => {
  const NOTE = "HER BIRTH MOVED BY A DAY. The act says she was born the day before.";

  const existing = {
    id: 'claim-1',
    statement: 'She was born 25 June 1868.',
    claim_type: 'date',
    date_text: '25 June 1868',
    status: 'supported' as const,
    confidence_level_id: 'confidence_probable',
    confidence_level_name: 'Probable',
    confidence_score: 65,
    evidence_count: 0,
    supporting_count: 0,
    contradicting_count: 0,
    research_section: null as string | null,
  };

  let posted: { url: string; method: string; body: Record<string, unknown> }[] = [];

  function mock(claims: unknown[]) {
    posted = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' || init?.method === 'PUT') {
        posted.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
        return Promise.resolve({ ok: true, json: async () => ({ id: 'new-claim' }) });
      }
      if (url.includes('/claims/confidence-levels'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [
          { id: 'confidence_confirmed', name: 'Confirmed', numeric_value: 95 },
          { id: 'confidence_disputed', name: 'Disputed', numeric_value: 40 },
          { id: 'confidence_unknown', name: 'Unknown', numeric_value: null },
        ] }) });
      if (url.includes('/claims/subject/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: claims }) });
      if (url.includes('/connected') || url.includes('/collections/for-object/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      /* Before the person branch: the relationships URL contains the person
         path, so checking the person first would hand it an object. */
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources'))
        return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/people/per-1'))
        return Promise.resolve({ ok: true, json: async () => ({ ...stubPerson, notes: NOTE }) });
      return Promise.resolve({ ok: true, json: async () => ({ ...stubPerson, notes: NOTE }) });
    });
  }

  async function openClaimsTab() {
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });
    fireEvent.click(screen.getByRole('tab', { name: /claims/i }));
  }

  it('creates a claim with the subject prefilled and a research section attached', async () => {
    mock([]);
    await openClaimsTab();

    fireEvent.click(await screen.findByRole('button', { name: /new claim/i }));

    const statement = await screen.findByLabelText(/statement/i);
    fireEvent.change(statement, { target: { value: 'She was born 25 June 1868.' } });
    fireEvent.change(screen.getByLabelText(/^confidence$/i), { target: { value: 'confidence_disputed' } });
    /* The section select is built from the note's own headings, which is what
       makes "Read the argument" work for a hand-entered claim. */
    fireEvent.change(screen.getByLabelText(/linked research section/i), {
      target: { value: 'note-her-birth-moved-by-a-day' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create claim/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].method).toBe('POST');
    expect(posted[0].url).toBe('/api/v1/claims');
    expect(posted[0].body).toMatchObject({
      statement: 'She was born 25 June 1868.',
      // Prefilled from the page, not typed.
      subject_object_id: 'per-1',
      confidence_level_id: 'confidence_disputed',
      research_section: 'note-her-birth-moved-by-a-day',
    });
  });

  it('edits an existing claim through the same form', async () => {
    perms.canEdit = true;
    mock([existing]);
    await openClaimsTab();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

    // The form opens populated from the claim rather than empty.
    expect((await screen.findByLabelText(/statement/i) as HTMLTextAreaElement).value)
      .toBe('She was born 25 June 1868.');
    expect((screen.getByLabelText(/^date$/i) as HTMLInputElement).value).toBe('25 June 1868');

    fireEvent.change(screen.getByLabelText(/^confidence$/i), { target: { value: 'confidence_confirmed' } });
    fireEvent.click(screen.getByRole('button', { name: /save claim/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].method).toBe('PUT');
    expect(posted[0].url).toBe('/api/v1/claims/claim-1');
    expect(posted[0].body).toMatchObject({ confidence_level_id: 'confidence_confirmed' });
  });

  /* Step 5 guessed which event a date claim was about by matching years. The
     drawer is where that guess becomes a decision. */
  describe('the fact a claim governs', () => {
    const drawerEvents = [
      { id: 'ev-b', event_type: 'birth', event_date: '25 JUN 1868', event_place: null, description: null },
      { id: 'ev-bap', event_type: 'baptism', event_date: '28 JUN 1868', event_place: null, description: null },
      { id: 'ev-undated', event_type: 'census', event_date: null, event_place: null, description: null },
    ];

    function mockWithEvents(claims: unknown[]) {
      mock(claims);
      const inner = global.fetch as unknown as (url: string, init?: RequestInit) => Promise<unknown>;
      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (!init?.method && !url.includes('/claims') && !url.includes('/connected')
          && !url.includes('/collections/') && !url.includes('/relationships')
          && !url.includes('/media') && !url.includes('/sources')) {
          return Promise.resolve({ ok: true, json: async () => ({ ...stubPerson, notes: NOTE, events: drawerEvents }) });
        }
        return inner(url, init);
      }) as unknown as typeof fetch;
    }

    it('offers each dated event, and match-by-year as the default', async () => {
      mockWithEvents([]);
      await openClaimsTab();
      fireEvent.click(await screen.findByRole('button', { name: /new claim/i }));
      /* A new claim starts as parentage, which governs no displayed fact. */
      expect(screen.queryByLabelText(/fact it governs/i)).not.toBeInTheDocument();
      fireEvent.change(await screen.findByLabelText(/^type$/i), { target: { value: 'date' } });

      const select = await screen.findByLabelText(/fact it governs/i) as HTMLSelectElement;
      /* Nothing is chosen for a new claim: the page carries on matching by
         year until somebody decides, rather than writing its own guess down. */
      expect(select.value).toBe('');
      expect(screen.getByRole('option', { name: /match by year/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Birth · 25 JUN 1868/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Baptism · 28 JUN 1868/ })).toBeInTheDocument();
      /* An undated event displays no date, so there is nothing to mark. */
      expect(screen.queryByRole('option', { name: /Census/i })).not.toBeInTheDocument();
    });

    it('sends the chosen event on create', async () => {
      mockWithEvents([]);
      await openClaimsTab();
      fireEvent.click(await screen.findByRole('button', { name: /new claim/i }));

      fireEvent.change(await screen.findByLabelText(/statement/i), { target: { value: 'She was baptised 28 June.' } });
      fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'date' } });
      fireEvent.change(screen.getByLabelText(/fact it governs/i), { target: { value: 'ev-bap' } });
      fireEvent.click(screen.getByRole('button', { name: /create claim/i }));

      await waitFor(() => expect(posted).toHaveLength(1));
      expect(posted[0].body).toMatchObject({ governs_object_id: 'ev-bap' });
    });

    it('opens an existing claim on the event it already names', async () => {
      perms.canEdit = true;
      mockWithEvents([{ ...existing, governs_object_id: 'ev-bap' }]);
      await openClaimsTab();

      fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

      expect((await screen.findByLabelText(/fact it governs/i) as HTMLSelectElement).value).toBe('ev-bap');
    });

    it('clears the link when the claim stops being about a date', async () => {
      perms.canEdit = true;
      mockWithEvents([{ ...existing, governs_object_id: 'ev-bap' }]);
      await openClaimsTab();
      fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

      await screen.findByLabelText(/fact it governs/i);
      fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'medical' } });

      /* The control goes with the date field: a medical claim marks no
         displayed fact, so a pointer nothing reads would be left behind. */
      expect(screen.queryByLabelText(/fact it governs/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /save claim/i }));
      await waitFor(() => expect(posted).toHaveLength(1));
      expect(posted[0].body).toMatchObject({ claim_type: 'medical', governs_object_id: '' });
    });

    it('names the governed fact on the card', async () => {
      perms.canEdit = true;
      mockWithEvents([{ ...existing, governs_object_id: 'ev-bap' }]);
      await openClaimsTab();

      const link = await screen.findByRole('link', { name: /Baptism · 28 JUN 1868/ });
      expect(link).toHaveAttribute('href', '/events/ev-bap');
    });

    it('says nothing on the card when no event was chosen', async () => {
      perms.canEdit = true;
      mockWithEvents([{ ...existing, governs_object_id: null }]);
      await openClaimsTab();

      await screen.findByText('She was born 25 June 1868.');
      /* The year-matching guess is not a decision, and a card that announced
         it would read like one. */
      expect(screen.queryByText(/^Governs/)).not.toBeInTheDocument();
    });
  });

  it('refuses to save a claim with no statement', async () => {
    perms.canEdit = false;
    mock([]);
    await openClaimsTab();
    fireEvent.click(await screen.findByRole('button', { name: /new claim/i }));

    fireEvent.click(screen.getByRole('button', { name: /create claim/i }));

    expect(await screen.findByText(/needs a statement/i)).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });
});

/* Issue #52, the rest of scope item 2: attaching records already in the
   archive. Evidence hangs off a claim id, so the interesting cases are the two
   ways the drawer comes to have one. */
describe('PersonDetailPage claim evidence', () => {
  const claim = {
    id: 'claim-1',
    statement: 'Her father is Preston, not Marlow.',
    claim_type: 'parentage',
    date_text: null,
    status: 'conflicted' as const,
    confidence_level_id: 'confidence_confirmed',
    confidence_level_name: 'Confirmed',
    confidence_score: 95,
    evidence_count: 1,
    supporting_count: 1,
    contradicting_count: 0,
    research_section: null as string | null,
  };

  const evidence = [{
    id: 'ev-1',
    evidence_object_id: 'art-1',
    evidence_role: 'supports' as const,
    excerpt: 'Preston Hadley, father',
    locator: 'page 59, entry 2357',
    title: 'Register of births, 1889',
  }];

  let calls: { url: string; method: string; body?: Record<string, unknown> }[] = [];

  function mock(opts: { evidence: typeof evidence }) {
    calls = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return Promise.resolve({ ok: true, json: async () => ({ id: 'claim-1' }) });
      }
      if (url.includes('/claims/confidence-levels'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (url.includes('/claims/subject/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [claim] }) });
      if (url.match(/\/claims\/claim-1$/))
        return Promise.resolve({ ok: true, json: async () => ({ ...claim, subjects: [], evidence: opts.evidence }) });
      if (url.includes('/connected') || url.includes('/collections/for-object/'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      if (url.includes('/relationships') || url.includes('/media') || url.includes('/sources'))
        return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => stubPerson });
    });
  }

  async function openEditDrawer() {
    perms.canEdit = true;
    perms.canDelete = true;
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });
    fireEvent.click(screen.getByRole('tab', { name: /claims/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
  }

  it('lists the records already attached, with role, locator and excerpt', async () => {
    mock({ evidence });
    await openEditDrawer();

    const title = await screen.findByText('Register of births, 1889');
    /* Scoped to the row: "Supports" is also an option in the Role select below,
       so a bare text query matches two things. */
    const row = title.closest('li')!;
    expect(row.querySelector('[data-role="supports"]')?.textContent).toBe('Supports');
    expect(within(row).getByText('page 59, entry 2357')).toBeInTheDocument();
    expect(within(row).getByText(/Preston Hadley, father/)).toBeInTheDocument();
  });

  it('detaches a record', async () => {
    mock({ evidence });
    await openEditDrawer();
    await screen.findByText('Register of births, 1889');

    fireEvent.click(screen.getByRole('button', { name: /detach/i }));

    await waitFor(() => expect(calls.some(c => c.method === 'DELETE')).toBe(true));
    const del = calls.find(c => c.method === 'DELETE')!;
    expect(del.url).toBe('/api/v1/claims/claim-1/evidence/ev-1');
  });

  it('says evidence waits for the claim to exist when creating one', async () => {
    mock({ evidence: [] });
    perms.canEdit = false;
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });
    fireEvent.click(screen.getByRole('tab', { name: /claims/i }));
    fireEvent.click(await screen.findByRole('button', { name: /new claim/i }));

    /* Evidence hangs off a claim id, so there is nothing honest to offer yet.
       Saying so beats an attach control that cannot work. */
    expect(await screen.findByText(/once the claim is created/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^evidence/i })).not.toBeInTheDocument();
  });

  it('keeps the drawer open on the new claim after creating it, so evidence can be attached', async () => {
    mock({ evidence: [] });
    perms.canEdit = true;
    renderPage();
    await screen.findByRole('button', { name: /view in tree/i });
    fireEvent.click(screen.getByRole('tab', { name: /claims/i }));
    fireEvent.click(await screen.findByRole('button', { name: /new claim/i }));

    fireEvent.change(await screen.findByLabelText(/statement/i), {
      target: { value: 'Her father is Preston, not Marlow.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create claim/i }));

    /* The POST returns the id, and the drawer turns into an edit of it rather
       than closing and making the reader find the card again. */
    await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
    expect(await screen.findByRole('heading', { name: /^evidence/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save claim/i })).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GlossaryPage from './GlossaryPage';

vi.mock('@/contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'w@e.test', display_name: 'Wes', role: 'admin' },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const TYPES = [
  { id: 'artifact_type_military_document', name: 'Military Document', description: 'Military record such as a draft card.' },
  { id: 'artifact_type_diary', name: 'Diary', description: 'Diary, journal, or personal daily record.' },
];
const EVIDENCE = [
  { id: 'evidence_official_record', name: 'Official Record', description: 'Record created by an official institution.', default_weight: 90 },
  { id: 'evidence_unknown', name: 'Unknown', description: 'Not determined.', default_weight: null },
];
const CONFIDENCE = [
  { id: 'confidence_probable', name: 'Probable', description: 'Supported by credible but incomplete evidence.', numeric_value: 65 },
];

function mockApi({ fail = false } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (fail) return { ok: false, status: 500, json: async () => ({}) } as Response;
    const url = String(input);
    const data = url.includes('/artifacts/types') ? TYPES
      : url.includes('/evidence-classifications') ? EVIDENCE
      : url.includes('/confidence-levels') ? CONFIDENCE
      : [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  }));
}

function renderPage() {
  return render(<MemoryRouter><GlossaryPage /></MemoryRouter>);
}

/* Several of these names appear in the prose as well as in the lists --
   "Official Record" is named in the type-vs-evidence example -- so assertions
   about the lists have to be scoped to the section that holds them. */
function section(heading: string | RegExp): HTMLElement {
  return screen.getByRole('heading', { name: heading }).closest('section')!;
}

beforeEach(() => { vi.stubGlobal('__APP_VERSION__', 'test'); });
afterEach(() => vi.unstubAllGlobals());

describe('GlossaryPage', () => {
  it('explains the concepts the issue asked for', async () => {
    mockApi();
    renderPage();

    for (const heading of ['Artifacts', 'Claims and confidence', 'Sources and citations', 'Stories', 'Collections', 'Events', 'Places']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  /* The distinction the issue calls the heart of the artifact model. */
  it('states the type vs. evidence rule with its example', async () => {
    mockApi();
    renderPage();

    expect(screen.getByRole('heading', { name: /type vs\. evidence/i })).toBeInTheDocument();
    expect(screen.getByText(/defined by/i)).toBeInTheDocument();
    expect(screen.getByText(/draft notice/i)).toBeInTheDocument();
  });

  /* Read live, not copied. The issue's own table listed twelve artifact types
     when there were sixteen, and used one of the missing four in its example. */
  it('lists the vocabularies from the API rather than a copy', async () => {
    mockApi();
    renderPage();

    await screen.findByText('Diary');

    const artifacts = within(section('Artifacts'));
    expect(artifacts.getByText('Military Document')).toBeInTheDocument();
    expect(artifacts.getByText('Diary')).toBeInTheDocument();

    expect(within(section('Evidence classifications')).getByText('Official Record')).toBeInTheDocument();
    expect(within(section('Claims and confidence')).getByText('Probable')).toBeInTheDocument();
  });

  it('shows the weight beside a classification that has one', async () => {
    mockApi();
    renderPage();

    await screen.findByText('Diary');
    const evidence = within(section('Evidence classifications'));

    const official = evidence.getByText('Official Record').closest('dt')!;
    expect(within(official).getByText('90')).toBeInTheDocument();

    // And nothing invented for the one that has none.
    const unknown = evidence.getByText('Unknown').closest('dt')!;
    expect(unknown.textContent).toBe('Unknown');
  });

  /* The explanations are the point; the lists illustrate them. */
  it('still explains everything when the lookups cannot be loaded', async () => {
    mockApi({ fail: true });
    renderPage();

    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument();
    expect(screen.getByText(/draft notice/i)).toBeInTheDocument();
  });

  it('offers a contents list that points at the sections', async () => {
    mockApi();
    renderPage();

    const toc = screen.getByRole('navigation', { name: /on this page/i });
    expect(within(toc).getByRole('link', { name: 'Artifacts' })).toHaveAttribute('href', '#artifacts');
    expect(within(toc).getByRole('link', { name: /claims & confidence/i })).toHaveAttribute('href', '#claims');
  });
});

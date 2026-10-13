import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FaqPage from './FaqPage';

vi.mock('@/contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'w@e.test', display_name: 'Wes', role: 'admin' },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const renderPage = () => render(<MemoryRouter><FaqPage /></MemoryRouter>);

// The navbar prints the running version.
beforeEach(() => vi.stubGlobal('__APP_VERSION__', 'test'));
afterEach(() => vi.unstubAllGlobals());

describe('FaqPage', () => {
  it('covers the subjects the issue asked for', () => {
    renderPage();

    for (const heading of [
      'Getting started',
      'People & the tree',
      'Artifacts, sources & claims',
      'Import & export',
      'Family & access',
      'Backups',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  /* The parser accepts four shapes and keeps anything else verbatim, so the
     page has to say which four -- the failure is silent otherwise, and shows
     up as an event sitting in the wrong place in a timeline. */
  it('says which date formats are read, and what happens to the rest', () => {
    renderPage();

    const question = screen.getByText('What date formats are accepted?');
    expect(question).toBeInTheDocument();

    const answer = question.closest('details')!;
    for (const shape of ['1990-11-29', '29 NOV 1990', 'NOV 1990', 'ABT 1900', 'BET 1900 AND 1910']) {
      expect(answer).toHaveTextContent(shape);
    }
    // And the one that silently loses its day and month.
    expect(answer).toHaveTextContent('Nov 29 1990');
  });

  /* A contents list that scrolls nowhere is worse than none: the anchor looks
     live and does nothing. */
  it('has a section for every entry in the contents list', () => {
    const { container } = renderPage();

    // This page's own contents list, not the app navbar, which is also a nav.
    const toc = screen.getByLabelText('On this page');
    const anchors = Array.from(toc.querySelectorAll('a[href^="#"]'));
    expect(anchors.length).toBeGreaterThan(0);

    for (const anchor of anchors) {
      const id = anchor.getAttribute('href')!.slice(1);
      expect(container.querySelector(`[id="${id}"]`), `no section with id "${id}"`).toBeTruthy();
    }
  });

  it('asks and answers each question as a disclosure', () => {
    const { container } = renderPage();

    const questions = container.querySelectorAll('details > summary');
    expect(questions.length).toBeGreaterThanOrEqual(15);
    // Every answer is reachable: a details with no content is a dead question.
    for (const summary of Array.from(questions)) {
      expect(summary.parentElement!.textContent!.length).toBeGreaterThan(
        summary.textContent!.length + 40,
      );
    }
  });

  /* The two corrections this page was built on. Both were wrong in the guides
     and would have been wrong here if the guides had simply been transcribed. */
  it('says invite codes work without an email server', () => {
    renderPage();

    expect(screen.getByText(/needs no email server/i)).toBeInTheDocument();
    expect(screen.getByText(/K7M2-R9TX/)).toBeInTheDocument();
  });

  it('says there is no scheduled backup', () => {
    renderPage();

    expect(screen.getByText(/no scheduled or daily backup/i)).toBeInTheDocument();
  });

  it('defers to the Glossary for concepts rather than redefining them', () => {
    renderPage();

    const glossaryLinks = screen.getAllByRole('link', { name: /glossary/i });
    expect(glossaryLinks.length).toBeGreaterThanOrEqual(2);
    expect(glossaryLinks[0]).toHaveAttribute('href', expect.stringContaining('/glossary'));
  });

  it('no longer shows the Coming Soon placeholder', () => {
    renderPage();

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import ConfidencePill from './ConfidencePill';

/* Four surfaces share this pill -- the person page, the claims list, a claim's
   own page and the FAQ. The vocabulary it draws from is tested in
   utils/confidence; this covers the drawing. */
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ConfidencePill', () => {
  it('shows the level and its number together', () => {
    wrap(<ConfidencePill name="Disputed" score={40} />);
    expect(screen.getByText('Disputed · 40')).toBeInTheDocument();
  });

  it('omits the number when there is not one', () => {
    /* "Confirmed · 95" says more than "Confirmed"; "Unknown · null" says less. */
    wrap(<ConfidencePill name="Unknown" score={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('says Unknown rather than nothing when the level is missing', () => {
    wrap(<ConfidencePill name={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('carries the level in a data attribute, so the fill comes from the tokens', () => {
    const { container } = wrap(<ConfidencePill name="Probable" score={65} />);
    expect(container.querySelector('[data-confidence="probable"]')).not.toBeNull();
  });

  it('renders a link when given a destination, and a plain span otherwise', () => {
    const { unmount } = wrap(<ConfidencePill name="Confirmed" score={95} to="/claims/c-1" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/claims/c-1');
    unmount();

    wrap(<ConfidencePill name="Confirmed" score={95} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps the words in the pill, so colour is never the only signal', () => {
    /* Red and green both sit on this ramp. */
    wrap(<ConfidencePill name="Rejected" score={0} title="Ruled out" />);
    const pill = screen.getByText('Rejected · 0');
    expect(pill).toHaveAttribute('title', 'Ruled out');
  });
});

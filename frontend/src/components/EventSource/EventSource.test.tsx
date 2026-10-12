import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventSourceFields, EventSourceLink } from './EventSource';
import { EMPTY_EVENT_SOURCE, todayIso, type EventSourceForm } from './eventSourceForm';

const OBIT = 'https://www.valadefuneralhome.com/obituaries/Jane-Conti?obId=27457330';

describe('EventSourceFields', () => {
  it('reports what the user types, leaving the other field alone', () => {
    const onChange = vi.fn();
    render(
      <EventSourceFields idPrefix="t" value={EMPTY_EVENT_SOURCE} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: OBIT } });

    expect(onChange).toHaveBeenCalledWith({ source_url: OBIT, source_url_checked_at: '' });
  });

  describe('the Today button', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 11, 9, 30));
    });
    afterEach(() => vi.useRealTimers());

    it('fills in today as a plain calendar date', () => {
      const onChange = vi.fn();
      const value: EventSourceForm = { source_url: OBIT, source_url_checked_at: '' };
      render(<EventSourceFields idPrefix="t" value={value} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Today' }));

      expect(onChange).toHaveBeenCalledWith({
        source_url: OBIT,
        source_url_checked_at: '2026-10-11',
      });
    });

    it('uses the local date, not UTC, late in the evening', () => {
      // 11 Oct 22:00 in a west-of-UTC zone is already 12 Oct in UTC. The user
      // means the day they are looking at.
      vi.setSystemTime(new Date(2026, 9, 11, 22, 0));
      expect(todayIso()).toBe('2026-10-11');
    });

    it('is disabled until there is a URL to have checked', () => {
      render(
        <EventSourceFields idPrefix="t" value={EMPTY_EVENT_SOURCE} onChange={vi.fn()} />,
      );

      expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
    });
  });
});

describe('EventSourceLink', () => {
  it('shows the host rather than a long query string, with the full address in the title', () => {
    render(<EventSourceLink url={OBIT} checkedAt="2026-10-11" />);

    const link = screen.getByRole('link', { name: 'valadefuneralhome.com' });
    expect(link).toHaveAttribute('href', OBIT);
    expect(link).toHaveAttribute('title', OBIT);
    expect(screen.getByText('checked 2026-10-11')).toBeInTheDocument();
  });

  it('opens in a new tab without handing over the opener', () => {
    render(<EventSourceLink url={OBIT} checkedAt={null} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing when there is no URL', () => {
    const { container } = render(<EventSourceLink url={null} checkedAt="2026-10-11" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to the stored text if it will not parse', () => {
    render(<EventSourceLink url="not a url" checkedAt={null} />);
    expect(screen.getByRole('link', { name: 'not a url' })).toBeInTheDocument();
  });
});

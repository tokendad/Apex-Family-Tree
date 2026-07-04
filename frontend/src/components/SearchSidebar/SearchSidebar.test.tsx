import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SearchSidebar from './SearchSidebar';

describe('SearchSidebar', () => {
  it('labels tree and people contexts as tree search', () => {
    render(<SearchSidebar context="people" />);

    expect(screen.getByText('Search tree')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name, place, date…')).toBeInTheDocument();
  });

  it('labels archive contexts as archive search', () => {
    render(<SearchSidebar context="artifacts" />);

    expect(screen.getByText('Search archive')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search artifact, story, place, tag…')).toBeInTheDocument();
  });
});

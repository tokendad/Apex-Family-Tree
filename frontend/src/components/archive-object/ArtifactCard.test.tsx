import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ArtifactCard from './ArtifactCard';

describe('ArtifactCard', () => {
  it('renders a linked card with title and subtitle', () => {
    render(
      <MemoryRouter>
        <ArtifactCard
          href="/artifacts/a1"
          title="WWII Draft Letter"
          subtitle="Letter • Official Record"
          typeName="Letter"
        />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /wwii draft letter/i });
    expect(link).toHaveAttribute('href', '/artifacts/a1');
    expect(screen.getByText('Letter • Official Record')).toBeInTheDocument();
  });
});

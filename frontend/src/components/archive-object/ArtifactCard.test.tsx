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

  it('shows the artifact\'s own image when there is one', () => {
    render(
      <MemoryRouter>
        <ArtifactCard
          href="/artifacts/m1"
          title="Grade 6 school photograph, 1991-92"
          typeName="Photo"
          imageSrc="/api/v1/media/m1"
        />
      </MemoryRouter>,
    );
    // Decorative: the card's own title already names it, so the image is not
    // announced a second time.
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('src', '/api/v1/media/m1');
    expect(img).toHaveAttribute('alt', '');
  });

  it('falls back to the type glyph when there is no image', () => {
    render(
      <MemoryRouter>
        <ArtifactCard href="/artifacts/a2" title="Marriage certificate" typeName="Certificate" />
      </MemoryRouter>,
    );
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('✉')).toBeInTheDocument();
  });
});

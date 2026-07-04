import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ArchiveObjectLayout from './ArchiveObjectLayout';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} data-router-link="true" {...props}>{children}</a>
    ),
  };
});

describe('ArchiveObjectLayout', () => {
  it('renders connected object hrefs with React Router links', () => {
    render(
      <MemoryRouter>
        <ArchiveObjectLayout
          eyebrow="Person"
          title="Ada Lovelace"
          tabs={[{ id: 'overview', label: 'Overview' }]}
          activeTab="overview"
          onTabChange={() => undefined}
          connectedGroups={[
            {
              id: 'artifacts',
              label: 'Artifacts',
              items: [{ id: 'artifact-1', title: 'Family Letter', href: '/artifacts/artifact-1' }],
            },
          ]}
        >
          <div>Overview</div>
        </ArchiveObjectLayout>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /family letter/i });
    expect(link).toHaveAttribute('href', '/artifacts/artifact-1');
    expect(link).toHaveAttribute('data-router-link', 'true');
  });
});

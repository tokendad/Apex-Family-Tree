import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('renders its tabs and reports the active one', async () => {
    const onTabChange = vi.fn();
    render(
      <MemoryRouter>
        <ArchiveObjectLayout
          eyebrow="Person"
          title="Ada Lovelace"
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'artifacts', label: 'Artifacts', count: 3 },
          ]}
          activeTab="overview"
          onTabChange={onTabChange}
        >
          <div>Overview body</div>
        </ArchiveObjectLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole('tab', { name: /overview/i })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: /artifacts/i }));
    expect(onTabChange).toHaveBeenCalledWith('artifacts');
  });

  it('does not render a separate connected-objects rail', () => {
    // Connections live in tabs. The rail duplicated both the tabs and the stat
    // row, and below 980px it unstacked beneath the content inside an
    // overflow:hidden shell where it could not be reached at all.
    render(
      <MemoryRouter>
        <ArchiveObjectLayout
          eyebrow="Person"
          title="Ada Lovelace"
          tabs={[{ id: 'overview', label: 'Overview' }]}
          activeTab="overview"
          onTabChange={() => undefined}
        >
          <div>Overview body</div>
        </ArchiveObjectLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Connected To')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Connected archive objects')).not.toBeInTheDocument();
  });
});

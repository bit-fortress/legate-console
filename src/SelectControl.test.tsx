// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SelectControl, SelectField } from './SelectControl';

describe('SelectControl', () => {
  afterEach(cleanup);

  it('does not open when the field caption is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SelectField
        label="Driver"
        value="openai"
        onChange={() => undefined}
        options={[{ value: 'openai', label: 'OpenAI Compatible' }]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Driver' });
    await user.click(screen.getByText('Driver'));

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox', { name: 'Driver' })).not.toBeInTheDocument();
  });

  it('renders structured option labels in both the trigger and menu', async () => {
    const user = userEvent.setup();
    const label = <><span>Custom Driver</span> <span className="driver-alias">(Workspace Driver)</span></>;
    render(
      <SelectControl
        ariaLabel="Driver"
        value="custom"
        onChange={() => undefined}
        options={[{ value: 'custom', label, textLabel: 'Custom Driver (Workspace Driver)' }]}
      />
    );

    expect(within(screen.getByRole('button', { name: 'Driver' })).getByText('(Workspace Driver)')).toHaveClass('driver-alias');
    await user.click(screen.getByRole('button', { name: 'Driver' }));
    const option = screen.getByRole('option', { name: 'Custom Driver (Workspace Driver)' });
    expect(within(option).getByText('(Workspace Driver)')).toHaveClass('driver-alias');
  });

  it('keeps the portal menu attached synchronously while its scroll container moves', async () => {
    const user = userEvent.setup();
    const { container } = renderSelect();
    const boundary = container.firstElementChild as HTMLElement;
    const root = screen.getByRole('button', { name: 'Driver' }).parentElement as HTMLElement;
    mockRect(boundary, { top: 60, bottom: 460, left: 20, width: 500, height: 400 });
    let triggerTop = 180;
    root.getBoundingClientRect = () => rect({ top: triggerTop, bottom: triggerTop + 32, left: 40, width: 280, height: 32 });

    await user.click(screen.getByRole('button', { name: 'Driver' }));
    const menu = screen.getByRole('listbox', { name: 'Driver' });
    expect(menu).toHaveStyle({ top: '216px', left: '40px', width: '280px' });

    triggerTop = 140;
    fireEvent.scroll(boundary);
    expect(menu).toHaveStyle({ top: '176px', left: '40px', width: '280px' });
  });

  it('keeps the portal menu out of document flow before measuring its trigger', async () => {
    const user = userEvent.setup();
    render(
      <SelectControl
        ariaLabel="Kind"
        value="text"
        onChange={() => undefined}
        options={[{ value: 'text', label: 'Text' }]}
      />
    );
    const root = screen.getByRole('button', { name: 'Kind' }).parentElement as HTMLElement;
    root.getBoundingClientRect = () => {
      const menu = document.querySelector('.select-menu') as HTMLElement;
      const left = menu.style.position === 'fixed' ? 80 : 64;
      return rect({ top: 100, bottom: 132, left, width: 280, height: 32 });
    };

    await user.click(screen.getByRole('button', { name: 'Kind' }));

    expect(screen.getByRole('listbox', { name: 'Kind' })).toHaveStyle({
      position: 'fixed',
      visibility: 'visible',
      left: '80px',
      width: '280px'
    });
  });

  it('closes the portal menu when its trigger leaves the scroll container viewport', async () => {
    const user = userEvent.setup();
    const { container } = renderSelect();
    const boundary = container.firstElementChild as HTMLElement;
    const root = screen.getByRole('button', { name: 'Driver' }).parentElement as HTMLElement;
    mockRect(boundary, { top: 60, bottom: 460, left: 20, width: 500, height: 400 });
    let triggerTop = 180;
    root.getBoundingClientRect = () => rect({ top: triggerTop, bottom: triggerTop + 32, left: 40, width: 280, height: 32 });

    await user.click(screen.getByRole('button', { name: 'Driver' }));
    expect(screen.getByRole('listbox', { name: 'Driver' })).toBeVisible();

    triggerTop = 30;
    fireEvent.scroll(boundary);
    await waitFor(() => expect(screen.queryByRole('listbox', { name: 'Driver' })).not.toBeInTheDocument());
  });

  it('does not constrain menu height to a horizontal-only table scroller', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div style={{ overflowY: 'auto', height: 400 }}>
        <div style={{ overflowX: 'auto' }}>
          <SelectControl
            ariaLabel="Role"
            value="admin"
            onChange={() => undefined}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'viewer', label: 'Viewer' },
              { value: 'usage_viewer', label: 'Usage viewer' }
            ]}
          />
        </div>
      </div>
    );
    const verticalBoundary = container.firstElementChild as HTMLElement;
    const horizontalScroller = verticalBoundary.firstElementChild as HTMLElement;
    const root = screen.getByRole('button', { name: 'Role' }).parentElement as HTMLElement;
    mockRect(verticalBoundary, { top: 60, bottom: 460, left: 20, width: 500, height: 400 });
    mockRect(horizontalScroller, { top: 160, bottom: 250, left: 20, width: 500, height: 90 });
    root.getBoundingClientRect = () => rect({ top: 180, bottom: 212, left: 40, width: 280, height: 32 });

    await user.click(screen.getByRole('button', { name: 'Role' }));

    expect(screen.getByRole('listbox', { name: 'Role' })).toHaveStyle({
      top: '216px',
      maxHeight: '220px'
    });
  });
});

function renderSelect() {
  return render(
    <div style={{ overflowY: 'auto', height: 400 }}>
      <SelectControl
        ariaLabel="Driver"
        value="openai"
        onChange={() => undefined}
        options={[
          { value: 'anthropic', label: 'Anthropic' },
          { value: 'openai', label: 'OpenAI Compatible' }
        ]}
      />
    </div>
  );
}

function mockRect(element: HTMLElement, values: Partial<DOMRect>) {
  element.getBoundingClientRect = () => rect(values);
}

function rect(values: Partial<DOMRect>): DOMRect {
  return {
    x: values.left ?? 0,
    y: values.top ?? 0,
    top: values.top ?? 0,
    right: values.right ?? ((values.left ?? 0) + (values.width ?? 0)),
    bottom: values.bottom ?? ((values.top ?? 0) + (values.height ?? 0)),
    left: values.left ?? 0,
    width: values.width ?? 0,
    height: values.height ?? 0,
    toJSON: () => ({})
  };
}

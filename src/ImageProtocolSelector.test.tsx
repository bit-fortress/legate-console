// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageProtocolSelector from './ImageProtocolSelector';

afterEach(cleanup);

describe('ImageProtocolSelector', () => {
  it('shows both friendly OpenAI image APIs with platform marks', () => {
    render(<ImageProtocolSelector label="Image APIs" values={[]} disabledContracts={new Set()} onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'OpenAI Image Generation' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'OpenAI Image Edit' })).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(2);
    expect(document.body).not.toHaveTextContent('2026-07-19');
  });

  it('prevents selecting an unsupported contract while allowing an existing selection to be removed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const edit = 'openai.images.edits/2026-07-19' as const;
    const { rerender } = render(
      <ImageProtocolSelector label="Image APIs" values={[]} disabledContracts={new Set([edit])} onChange={onChange} />
    );
    expect(screen.getByRole('checkbox', { name: 'OpenAI Image Edit' })).toBeDisabled();
    rerender(<ImageProtocolSelector label="Image APIs" values={[edit]} disabledContracts={new Set([edit])} onChange={onChange} />);
    const checked = screen.getByRole('checkbox', { name: 'OpenAI Image Edit' });
    expect(checked).not.toBeDisabled();
    await user.click(checked);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TextProtocolSelector from './TextProtocolSelector';

afterEach(cleanup);

describe('TextProtocolSelector', () => {
  it('renders flat platform-branded protocol choices', () => {
    const { container } = render(
      <TextProtocolSelector label="Inbound protocols" values={[]} disabledContracts={new Set()} onChange={() => {}} />
    );

    expect(screen.getByLabelText('OpenAI Chat Completions')).toBeTruthy();
    expect(screen.getByLabelText('OpenAI Responses')).toBeTruthy();
    expect(screen.getByLabelText('Anthropic Messages')).toBeTruthy();
    expect(container.querySelectorAll('.text-protocol-logo img')).toHaveLength(3);
  });

  it('disables unsupported unchecked contracts but keeps checked values removable', () => {
    const onChange = vi.fn();
    render(
      <TextProtocolSelector
        label="Inbound protocols"
        values={['openai.chat_completions/2026-07-18']}
        disabledContracts={new Set(['openai.chat_completions/2026-07-18', 'anthropic.messages/2026-07-18'])}
        onChange={onChange}
      />
    );

    const selected = screen.getByLabelText('OpenAI Chat Completions') as HTMLInputElement;
    expect(selected.disabled).toBe(false);
    expect((screen.getByLabelText('Anthropic Messages') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(selected);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

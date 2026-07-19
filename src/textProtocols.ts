import type { TextProtocolContract } from './types';

export const TEXT_PROTOCOL_CONTRACTS: TextProtocolContract[] = [
  'openai.chat_completions/2026-07-18',
  'openai.responses/2026-07-18',
  'anthropic.messages/2026-07-18'
];

export function textProtocolDisplayName(contract: TextProtocolContract): string {
  switch (contract) {
    case 'openai.chat_completions/2026-07-18':
      return 'OpenAI Chat Completions';
    case 'openai.responses/2026-07-18':
      return 'OpenAI Responses';
    case 'anthropic.messages/2026-07-18':
      return 'Anthropic Messages';
  }
}

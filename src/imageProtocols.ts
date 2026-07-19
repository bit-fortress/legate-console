import type { ImageProtocolContract } from './types';

export const IMAGE_PROTOCOL_CONTRACTS: ImageProtocolContract[] = [
  'openai.images.generations/2026-07-19',
  'openai.images.edits/2026-07-19'
];

export function imageProtocolDisplayName(contract: ImageProtocolContract): string {
  switch (contract) {
    case 'openai.images.generations/2026-07-19':
      return 'OpenAI Image Generation';
    case 'openai.images.edits/2026-07-19':
      return 'OpenAI Image Edit';
  }
}

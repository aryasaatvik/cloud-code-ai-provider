import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

export function mapCloudCodeFinishReason(
  finishReason: string | undefined,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
      return 'content-filter';
    case 'RECITATION':
      return 'content-filter';
    case 'OTHER':
      return 'other';
    default:
      return 'unknown';
  }
}
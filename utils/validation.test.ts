import { describe, expect, it } from 'vitest';
import { validateApiKey, validateBatchSize, validateImageData, validatePrompt } from './validation';

describe('validation helpers', () => {
  it('throws ValidationError messages from Zod v4 issues', () => {
    expect(() => validateApiKey('short')).toThrow('API Key');
    expect(() => validatePrompt('x'.repeat(10001))).toThrow();
    expect(() => validateBatchSize(0)).toThrow();
    expect(() => validateImageData('not-a-data-url')).toThrow();
  });
});

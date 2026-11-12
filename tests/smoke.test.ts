import { describe, expect, it } from 'vitest';
import { version } from '../src/index';

describe('smoke', () => {
  it('экспортирует версию движка', () => {
    expect(version()).toBe('0.1.1');
  });
});

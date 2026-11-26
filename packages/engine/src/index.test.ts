import { describe, expect, it } from 'vitest';
import { CONFIG_SCHEMA_VERSION, ENGINE_VERSION, tokens } from './index';

describe('engine', () => {
  it('exposes versions', () => {
    expect(ENGINE_VERSION).toBe('0.2.0');
    expect(CONFIG_SCHEMA_VERSION).toBe(1);
  });

  it('defines the six design tokens as hex colors', () => {
    expect(Object.keys(tokens)).toEqual([
      'midnight',
      'violet',
      'blue',
      'lavender',
      'cloud',
      'secondary',
    ]);
    for (const value of Object.values(tokens)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

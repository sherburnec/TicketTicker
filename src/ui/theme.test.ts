import { describe, expect, it } from 'vitest';
import { nextChoice, resolveTheme } from './theme.ts';

describe('theme choice', () => {
  it('cycles system, light, dark and back', () => {
    expect(nextChoice('system')).toBe('light');
    expect(nextChoice('light')).toBe('dark');
    expect(nextChoice('dark')).toBe('system');
  });

  it('follows the system only when the choice is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

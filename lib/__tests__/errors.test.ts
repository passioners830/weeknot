import { getErrorMessage } from '../errors';

describe('getErrorMessage', () => {
  it('returns the message property when present', () => {
    expect(getErrorMessage({ message: '失敗しました' }, 'fallback')).toBe('失敗しました');
  });

  it('returns the fallback when message is missing', () => {
    expect(getErrorMessage({}, 'fallback')).toBe('fallback');
  });

  it('returns the fallback when message is not a string', () => {
    expect(getErrorMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });

  it('returns the fallback for null or undefined', () => {
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('returns the fallback for primitive values', () => {
    expect(getErrorMessage('some string', 'fallback')).toBe('fallback');
    expect(getErrorMessage(42, 'fallback')).toBe('fallback');
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasOrganizedThisWeek, markOrganizedNow } from '../organizeHistory';
/* eslint-enable import/first */

beforeEach(async () => {
  await AsyncStorage.clear();
});

// 2026-10-18は日曜日。週は日曜始まり（10/18〜10/24）
describe('hasOrganizedThisWeek', () => {
  it('is false when the user has never organized', async () => {
    expect(await hasOrganizedThisWeek(new Date(2026, 9, 20))).toBe(false);
  });

  it('is true for any later day in the same week', async () => {
    await markOrganizedNow(new Date(2026, 9, 18, 18, 30));

    expect(await hasOrganizedThisWeek(new Date(2026, 9, 18, 23, 59))).toBe(true);
    expect(await hasOrganizedThisWeek(new Date(2026, 9, 21, 8, 0))).toBe(true);
    expect(await hasOrganizedThisWeek(new Date(2026, 9, 24, 23, 59))).toBe(true);
  });

  it('is false once the next week starts on Sunday', async () => {
    await markOrganizedNow(new Date(2026, 9, 21, 12, 0));

    expect(await hasOrganizedThisWeek(new Date(2026, 9, 24, 23, 59))).toBe(true);
    expect(await hasOrganizedThisWeek(new Date(2026, 9, 25, 0, 0))).toBe(false);
  });

  it('is false for a stale record from an earlier week or year', async () => {
    await markOrganizedNow(new Date(2025, 9, 21));

    expect(await hasOrganizedThisWeek(new Date(2026, 9, 21))).toBe(false);
  });

  it('treats a corrupted record as not organized', async () => {
    await AsyncStorage.setItem('lastOrganizedAt:v1', 'abc');

    expect(await hasOrganizedThisWeek(new Date(2026, 9, 21))).toBe(false);
  });
});

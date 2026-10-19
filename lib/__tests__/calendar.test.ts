import {
  addMonths,
  buildMonthGrid,
  dayKey,
  groupHighlightsByDay,
  isSameWeek,
  monthDayKey,
  monthRange,
  startOfWeek,
} from '../calendar';
import type { Highlight } from '../highlights';

function highlight(id: string, createdAt: string): Highlight {
  return { id, createdAt, photoCount: 1, visibility: 'private', circleIds: [] };
}

describe('dayKey / monthDayKey', () => {
  it('formats local dates as zero-padded YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(monthDayKey(2026, 11, 31)).toBe('2026-12-31');
  });

  it('agrees between the two helpers', () => {
    expect(dayKey(new Date(2026, 9, 19))).toBe(monthDayKey(2026, 9, 19));
  });
});

describe('buildMonthGrid', () => {
  it('lays out October 2026 (starts on Thursday) in Sunday-first weeks', () => {
    const weeks = buildMonthGrid(2026, 9);

    expect(weeks[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(weeks[weeks.length - 1]).toEqual([25, 26, 27, 28, 29, 30, 31]);
    expect(weeks).toHaveLength(5);
  });

  it('pads the trailing week with nulls and always uses full 7-day rows', () => {
    const weeks = buildMonthGrid(2026, 10);

    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((d) => d !== null)).toHaveLength(30);
    expect(weeks[weeks.length - 1].slice(-2)).toEqual([null, null]);
  });

  it('handles a month that needs six rows', () => {
    // 2026年8月は土曜始まりで31日あるため6週になる
    expect(buildMonthGrid(2026, 7)).toHaveLength(6);
  });

  it('handles February in a leap year', () => {
    expect(buildMonthGrid(2028, 1).flat().filter((d) => d !== null)).toHaveLength(29);
  });
});

describe('startOfWeek / isSameWeek', () => {
  it('returns the Sunday 00:00 of the week for any weekday', () => {
    const sunday = new Date(2026, 9, 18);

    expect(startOfWeek(new Date(2026, 9, 18, 23, 59))).toEqual(sunday);
    expect(startOfWeek(new Date(2026, 9, 21, 12, 0))).toEqual(sunday);
    expect(startOfWeek(new Date(2026, 9, 24, 23, 59))).toEqual(sunday);
  });

  it('crosses month and year boundaries correctly', () => {
    expect(startOfWeek(new Date(2026, 10, 1))).toEqual(new Date(2026, 10, 1));
    expect(startOfWeek(new Date(2026, 0, 1))).toEqual(new Date(2025, 11, 28));
  });

  it('treats Saturday and the following Sunday as different weeks', () => {
    expect(isSameWeek(new Date(2026, 9, 24, 23, 59), new Date(2026, 9, 25, 0, 0))).toBe(false);
    expect(isSameWeek(new Date(2026, 9, 18), new Date(2026, 9, 24))).toBe(true);
  });
});

describe('monthRange / addMonths', () => {
  it('returns the first instant of the month and of the next month', () => {
    const { start, end } = monthRange(2026, 11);

    expect(start).toEqual(new Date(2026, 11, 1));
    expect(end).toEqual(new Date(2027, 0, 1));
  });

  it('rolls over year boundaries in both directions', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe('groupHighlightsByDay', () => {
  it('groups highlights by local day and keeps their order', () => {
    const morning = new Date(2026, 9, 5, 9, 0).toISOString();
    const night = new Date(2026, 9, 5, 23, 30).toISOString();
    const nextDay = new Date(2026, 9, 6, 0, 10).toISOString();

    const grouped = groupHighlightsByDay([
      highlight('a', night),
      highlight('b', morning),
      highlight('c', nextDay),
    ]);

    expect(Object.keys(grouped).sort()).toEqual(['2026-10-05', '2026-10-06']);
    expect(grouped['2026-10-05'].map((h) => h.id)).toEqual(['a', 'b']);
    expect(grouped['2026-10-06'].map((h) => h.id)).toEqual(['c']);
  });

  it('returns an empty object for no highlights', () => {
    expect(groupHighlightsByDay([])).toEqual({});
  });
});

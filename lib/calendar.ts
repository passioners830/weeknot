import type { Highlight } from './highlights';

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// 端末のローカル時間での日付キー。created_atはUTCで保存されているが、
// 「その日の投稿」はユーザーの感覚（ローカル時間）で分けたい
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// month は 0 始まり（0 = 1月）
export function monthDayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// その日を含む週（日曜始まり）の日曜0時。週をまたぐかどうかの判定に使う
export function startOfWeek(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

export function isSameWeek(a: Date, b: Date): boolean {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

export function monthRange(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

// 日曜始まりの週ごとの配列。月の前後の空きマスはnull
export function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function groupHighlightsByDay(highlights: Highlight[]): Record<string, Highlight[]> {
  const grouped: Record<string, Highlight[]> = {};
  for (const highlight of highlights) {
    const key = dayKey(new Date(highlight.createdAt));
    (grouped[key] ??= []).push(highlight);
  }
  return grouped;
}

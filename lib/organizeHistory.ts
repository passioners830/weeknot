import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSameWeek } from './calendar';

const STORAGE_KEY = 'lastOrganizedAt:v1';

export async function markOrganizedNow(now: Date = new Date()): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, String(now.getTime()));
}

// 今週（日曜始まり）にすでに整理を最後まで終えているか
export async function hasOrganizedThisWeek(now: Date = new Date()): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const last = Number(raw);
  if (!Number.isFinite(last)) return false;
  return isSameWeek(new Date(last), now);
}

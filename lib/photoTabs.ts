import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'photoTabs:v1';
export const MAX_TAB_NAME_LENGTH = 20;

export type PhotoTab = { id: string; name: string };
export type PhotoTabsState = {
  tabs: PhotoTab[];
  assignments: Record<string, { tabId: string; addedAt: number }>;
};

async function readState(): Promise<PhotoTabsState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { tabs: [], assignments: {} };
  try {
    const parsed = JSON.parse(raw);
    return {
      tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
      assignments:
        parsed.assignments && typeof parsed.assignments === 'object' ? parsed.assignments : {},
    };
  } catch {
    return { tabs: [], assignments: {} };
  }
}

// 連続した操作（スワイプ中の振り分けなど）が読み込み→書き込みの途中で重なって
// 更新が失われないよう、書き込みは1本のキューに直列化する
let writeQueue: Promise<unknown> = Promise.resolve();

function update<T>(mutate: (state: PhotoTabsState) => T): Promise<T> {
  const run = writeQueue.then(async () => {
    const state = await readState();
    const result = mutate(state);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return result;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function validateName(state: PhotoTabsState, name: string, excludeId?: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('タブ名を入力してください');
  if (trimmed.length > MAX_TAB_NAME_LENGTH) {
    throw new Error(`タブ名は${MAX_TAB_NAME_LENGTH}文字以内にしてください`);
  }
  if (state.tabs.some((t) => t.id !== excludeId && t.name === trimmed)) {
    throw new Error('その名前のタブはすでにあります');
  }
  return trimmed;
}

export async function getPhotoTabsState(): Promise<PhotoTabsState> {
  await writeQueue;
  return readState();
}

export function createPhotoTab(name: string): Promise<PhotoTab> {
  return update((state) => {
    const tab = { id: generateId(), name: validateName(state, name) };
    state.tabs.push(tab);
    return tab;
  });
}

export function renamePhotoTab(tabId: string, name: string): Promise<void> {
  return update((state) => {
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error('タブが見つかりません');
    tab.name = validateName(state, name, tabId);
  });
}

export function deletePhotoTab(tabId: string): Promise<void> {
  return update((state) => {
    state.tabs = state.tabs.filter((t) => t.id !== tabId);
    for (const [assetId, assignment] of Object.entries(state.assignments)) {
      if (assignment.tabId === tabId) delete state.assignments[assetId];
    }
  });
}

// 1枚の写真は1つのタブにだけ入る。すでに別のタブにある写真は移動になる
export function assignPhotosToTab(assetIds: string[], tabId: string): Promise<void> {
  return update((state) => {
    if (!state.tabs.some((t) => t.id === tabId)) throw new Error('タブが見つかりません');
    // 同じミリ秒内に複数回呼ばれても並び順が崩れないよう、常に既存の最大値より大きい値を振る
    const latest = Math.max(0, ...Object.values(state.assignments).map((a) => a.addedAt));
    let addedAt = Math.max(Date.now(), latest + 1);
    for (const assetId of assetIds) {
      state.assignments[assetId] = { tabId, addedAt: addedAt++ };
    }
  });
}

export function unassignPhotos(assetIds: string[]): Promise<void> {
  return update((state) => {
    for (const assetId of assetIds) delete state.assignments[assetId];
  });
}

export function getTabPhotoIds(state: PhotoTabsState, tabId: string): string[] {
  return Object.entries(state.assignments)
    .filter(([, assignment]) => assignment.tabId === tabId)
    .sort(([, a], [, b]) => b.addedAt - a.addedAt)
    .map(([assetId]) => assetId);
}

export function countPhotosByTab(state: PhotoTabsState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { tabId } of Object.values(state.assignments)) {
    counts[tabId] = (counts[tabId] ?? 0) + 1;
  }
  return counts;
}

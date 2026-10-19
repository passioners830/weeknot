jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  assignPhotosToTab,
  countPhotosByTab,
  createPhotoTab,
  deletePhotoTab,
  getPhotoTabsState,
  getTabPhotoIds,
  renamePhotoTab,
  unassignPhotos,
} from '../photoTabs';
/* eslint-enable import/first */

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('createPhotoTab', () => {
  it('creates a tab with a trimmed name and persists it', async () => {
    const tab = await createPhotoTab('  家族  ');

    expect(tab.name).toBe('家族');
    expect((await getPhotoTabsState()).tabs).toEqual([tab]);
  });

  it('rejects empty, too long and duplicate names', async () => {
    await createPhotoTab('旅行');

    await expect(createPhotoTab('   ')).rejects.toThrow('タブ名を入力してください');
    await expect(createPhotoTab('あ'.repeat(21))).rejects.toThrow('20文字以内');
    await expect(createPhotoTab('旅行')).rejects.toThrow('すでにあります');
    expect((await getPhotoTabsState()).tabs).toHaveLength(1);
  });
});

describe('renamePhotoTab', () => {
  it('renames a tab', async () => {
    const tab = await createPhotoTab('旅行');

    await renamePhotoTab(tab.id, 'おでかけ');

    expect((await getPhotoTabsState()).tabs[0].name).toBe('おでかけ');
  });

  it('allows keeping the same name but rejects another tab\'s name', async () => {
    const a = await createPhotoTab('A');
    await createPhotoTab('B');

    await expect(renamePhotoTab(a.id, 'A')).resolves.toBeUndefined();
    await expect(renamePhotoTab(a.id, 'B')).rejects.toThrow('すでにあります');
  });

  it('throws for an unknown tab', async () => {
    await expect(renamePhotoTab('missing', 'X')).rejects.toThrow('タブが見つかりません');
  });
});

describe('assignPhotosToTab', () => {
  it('assigns photos and lists them newest first', async () => {
    const tab = await createPhotoTab('家族');

    await assignPhotosToTab(['p1'], tab.id);
    await assignPhotosToTab(['p2', 'p3'], tab.id);

    const state = await getPhotoTabsState();
    expect(getTabPhotoIds(state, tab.id)).toEqual(['p3', 'p2', 'p1']);
  });

  it('moves a photo that is already in another tab', async () => {
    const a = await createPhotoTab('A');
    const b = await createPhotoTab('B');
    await assignPhotosToTab(['p1'], a.id);

    await assignPhotosToTab(['p1'], b.id);

    const state = await getPhotoTabsState();
    expect(getTabPhotoIds(state, a.id)).toEqual([]);
    expect(getTabPhotoIds(state, b.id)).toEqual(['p1']);
  });

  it('throws for an unknown tab without changing anything', async () => {
    await expect(assignPhotosToTab(['p1'], 'missing')).rejects.toThrow('タブが見つかりません');
    expect((await getPhotoTabsState()).assignments).toEqual({});
  });

  it('keeps every update when called concurrently', async () => {
    const tab = await createPhotoTab('家族');

    await Promise.all(['p1', 'p2', 'p3', 'p4'].map((id) => assignPhotosToTab([id], tab.id)));

    const state = await getPhotoTabsState();
    expect(getTabPhotoIds(state, tab.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('unassignPhotos', () => {
  it('removes photos from their tabs', async () => {
    const tab = await createPhotoTab('家族');
    await assignPhotosToTab(['p1', 'p2'], tab.id);

    await unassignPhotos(['p1']);

    expect(getTabPhotoIds(await getPhotoTabsState(), tab.id)).toEqual(['p2']);
  });
});

describe('deletePhotoTab', () => {
  it('removes the tab and its assignments but keeps other tabs intact', async () => {
    const a = await createPhotoTab('A');
    const b = await createPhotoTab('B');
    await assignPhotosToTab(['p1'], a.id);
    await assignPhotosToTab(['p2'], b.id);

    await deletePhotoTab(a.id);

    const state = await getPhotoTabsState();
    expect(state.tabs.map((t) => t.id)).toEqual([b.id]);
    expect(Object.keys(state.assignments)).toEqual(['p2']);
  });
});

describe('countPhotosByTab', () => {
  it('counts photos per tab', async () => {
    const a = await createPhotoTab('A');
    const b = await createPhotoTab('B');
    await assignPhotosToTab(['p1', 'p2'], a.id);
    await assignPhotosToTab(['p3'], b.id);

    expect(countPhotosByTab(await getPhotoTabsState())).toEqual({ [a.id]: 2, [b.id]: 1 });
  });
});

describe('getPhotoTabsState', () => {
  it('returns an empty state when nothing is stored or the data is corrupted', async () => {
    expect(await getPhotoTabsState()).toEqual({ tabs: [], assignments: {} });

    await AsyncStorage.setItem('photoTabs:v1', '{not json');
    expect(await getPhotoTabsState()).toEqual({ tabs: [], assignments: {} });
  });
});

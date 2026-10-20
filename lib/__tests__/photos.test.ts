import { Platform } from 'react-native';
import { makeStorageBucket, makeUser } from '../testUtils';

jest.mock('../supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, storage: { from: jest.fn() } },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import {
  deleteHighlightPhotos,
  getHighlightPhotoUrl,
  getHighlightPhotoUrls,
  uploadHighlightPhotos,
} from '../photos';
/* eslint-enable import/first */

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockStorageFrom = supabase.storage.from as jest.Mock;
const originalPlatformOS = Platform.OS;

beforeEach(() => {
  mockGetUser.mockReset();
  mockStorageFrom.mockReset();
});

afterEach(() => {
  (Platform as { OS: string }).OS = originalPlatformOS;
});

describe('getHighlightPhotoUrls', () => {
  it('returns signed urls for every file under the author/highlight prefix', async () => {
    const bucket = makeStorageBucket({
      list: { data: [{ name: '0.jpg' }, { name: '1.jpg' }], error: null },
      createSignedUrls: {
        data: [{ signedUrl: 'https://example.com/0.jpg' }, { signedUrl: 'https://example.com/1.jpg' }],
        error: null,
      },
    });
    mockStorageFrom.mockReturnValue(bucket);

    const urls = await getHighlightPhotoUrls('author1', 'h1');

    expect(bucket.list).toHaveBeenCalledWith('author1/h1');
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(
      ['author1/h1/0.jpg', 'author1/h1/1.jpg'],
      60 * 60
    );
    expect(urls).toEqual(['https://example.com/0.jpg', 'https://example.com/1.jpg']);
  });

  it('filters out entries with no signed url', async () => {
    const bucket = makeStorageBucket({
      list: { data: [{ name: '0.jpg' }], error: null },
      createSignedUrls: { data: [{ signedUrl: null }], error: null },
    });
    mockStorageFrom.mockReturnValue(bucket);

    expect(await getHighlightPhotoUrls('author1', 'h1')).toEqual([]);
  });

  it('returns an empty array without requesting signed urls when there are no files', async () => {
    const bucket = makeStorageBucket({ list: { data: [], error: null } });
    mockStorageFrom.mockReturnValue(bucket);

    expect(await getHighlightPhotoUrls('author1', 'h1')).toEqual([]);
    expect(bucket.createSignedUrls).not.toHaveBeenCalled();
  });

  it('throws when listing fails', async () => {
    const bucket = makeStorageBucket({ list: { data: null, error: new Error('list failed') } });
    mockStorageFrom.mockReturnValue(bucket);

    await expect(getHighlightPhotoUrls('author1', 'h1')).rejects.toThrow('list failed');
  });
});

describe('getHighlightPhotoUrl', () => {
  it('signs the path for the n-th photo of a highlight', async () => {
    const bucket = makeStorageBucket({
      createSignedUrl: { data: { signedUrl: 'https://example.com/2.jpg' }, error: null },
    });
    mockStorageFrom.mockReturnValue(bucket);

    const url = await getHighlightPhotoUrl('author1', 'h1', 2);

    expect(bucket.createSignedUrl).toHaveBeenCalledWith('author1/h1/2.jpg', 60 * 60);
    expect(url).toBe('https://example.com/2.jpg');
  });

  it('returns null when no url comes back and throws on an error', async () => {
    mockStorageFrom.mockReturnValueOnce(makeStorageBucket({}));
    expect(await getHighlightPhotoUrl('author1', 'h1', 0)).toBeNull();

    mockStorageFrom.mockReturnValueOnce(
      makeStorageBucket({ createSignedUrl: { data: null, error: new Error('sign failed') } })
    );
    await expect(getHighlightPhotoUrl('author1', 'h1', 0)).rejects.toThrow('sign failed');
  });
});

describe('deleteHighlightPhotos', () => {
  it('removes every file under the prefix', async () => {
    const bucket = makeStorageBucket({
      list: { data: [{ name: '0.jpg' }, { name: '1.jpg' }], error: null },
    });
    mockStorageFrom.mockReturnValue(bucket);

    await deleteHighlightPhotos('author1', 'h1');

    expect(bucket.remove).toHaveBeenCalledWith(['author1/h1/0.jpg', 'author1/h1/1.jpg']);
  });

  it('does nothing when there are no files to delete', async () => {
    const bucket = makeStorageBucket({ list: { data: [], error: null } });
    mockStorageFrom.mockReturnValue(bucket);

    await deleteHighlightPhotos('author1', 'h1');

    expect(bucket.remove).not.toHaveBeenCalled();
  });
});

describe('uploadHighlightPhotos', () => {
  it('throws when not logged in and never touches storage', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(uploadHighlightPhotos('h1', [{ id: 'p1', uri: 'file://a.jpg' }])).rejects.toThrow(
      'ログインしていません'
    );
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('uploads each photo to a path keyed by user, highlight and index (web)', async () => {
    (Platform as { OS: string }).OS = 'web';
    mockGetUser.mockResolvedValue(makeUser('me'));
    const bucket = makeStorageBucket({});
    mockStorageFrom.mockReturnValue(bucket);
    globalThis.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob()) }) as never;

    await uploadHighlightPhotos('h1', [
      { id: 'p1', uri: 'https://example.com/a.jpg' },
      { id: 'p2', uri: 'https://example.com/b.jpg' },
    ]);

    expect(bucket.upload).toHaveBeenNthCalledWith(1, 'me/h1/0.jpg', expect.anything(), {
      contentType: 'image/jpeg',
      upsert: true,
    });
    expect(bucket.upload).toHaveBeenNthCalledWith(2, 'me/h1/1.jpg', expect.anything(), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  });

  it('throws when a single upload fails (web)', async () => {
    (Platform as { OS: string }).OS = 'web';
    mockGetUser.mockResolvedValue(makeUser('me'));
    const bucket = makeStorageBucket({ upload: { data: null, error: new Error('upload failed') } });
    mockStorageFrom.mockReturnValue(bucket);
    globalThis.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob()) }) as never;

    await expect(
      uploadHighlightPhotos('h1', [{ id: 'p1', uri: 'https://example.com/a.jpg' }])
    ).rejects.toThrow('upload failed');
  });
});

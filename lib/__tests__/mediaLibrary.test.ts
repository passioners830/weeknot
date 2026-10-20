import { Platform } from 'react-native';

jest.mock('expo-media-library/legacy', () => ({
  getAssetInfoAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
  MediaType: { photo: 'photo' },
  SortBy: { creationTime: 'creationTime' },
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { getLibraryPhotoIds, resolvePhotoUriById, savePhotoFromUrl } from '../mediaLibrary';
/* eslint-enable import/first */

const mockGetAssetInfo = MediaLibrary.getAssetInfoAsync as jest.Mock;
const mockGetAssets = MediaLibrary.getAssetsAsync as jest.Mock;
const mockRequestPermissions = MediaLibrary.requestPermissionsAsync as jest.Mock;
const mockSaveToLibrary = MediaLibrary.saveToLibraryAsync as jest.Mock;
const mockDownload = FileSystem.downloadAsync as jest.Mock;
const originalPlatformOS = Platform.OS;

beforeEach(() => {
  mockGetAssetInfo.mockReset();
  mockGetAssets.mockReset();
  mockRequestPermissions.mockReset();
  mockSaveToLibrary.mockReset();
  mockDownload.mockReset();
});

afterEach(() => {
  (Platform as { OS: string }).OS = originalPlatformOS;
});

describe('resolvePhotoUriById', () => {
  it('builds the MediaStore content uri on android without querying asset info', async () => {
    (Platform as { OS: string }).OS = 'android';

    expect(await resolvePhotoUriById('12345')).toBe('content://media/external/images/media/12345');
    expect(mockGetAssetInfo).not.toHaveBeenCalled();
  });

  it('prefers the local uri from asset info on ios', async () => {
    (Platform as { OS: string }).OS = 'ios';
    mockGetAssetInfo.mockResolvedValue({ localUri: 'file:///local.jpg', uri: 'ph://abc' });

    expect(await resolvePhotoUriById('abc')).toBe('file:///local.jpg');
  });

  it('falls back to the ph uri on ios when asset info is missing or fails', async () => {
    (Platform as { OS: string }).OS = 'ios';

    mockGetAssetInfo.mockResolvedValueOnce(null);
    expect(await resolvePhotoUriById('abc')).toBe('ph://abc');

    mockGetAssetInfo.mockRejectedValueOnce(new Error('boom'));
    expect(await resolvePhotoUriById('abc')).toBe('ph://abc');
  });

  it('returns a mock image url on web', async () => {
    (Platform as { OS: string }).OS = 'web';

    expect(await resolvePhotoUriById('101')).toBe('https://picsum.photos/id/101/300/400');
  });
});

describe('getLibraryPhotoIds', () => {
  it('returns the ids of the most recent photos', async () => {
    (Platform as { OS: string }).OS = 'android';
    mockGetAssets.mockResolvedValue({ assets: [{ id: '3' }, { id: '2' }] });

    expect(await getLibraryPhotoIds(2)).toEqual(['3', '2']);
    expect(mockGetAssets).toHaveBeenCalledWith(expect.objectContaining({ first: 2 }));
  });

  it('returns the mock photo ids on web', async () => {
    (Platform as { OS: string }).OS = 'web';

    expect(await getLibraryPhotoIds()).toEqual(['100', '101', '102', '103', '104', '105', '106', '107']);
    expect(mockGetAssets).not.toHaveBeenCalled();
  });
});

describe('savePhotoFromUrl', () => {
  it('downloads the photo and saves it to the library on native', async () => {
    (Platform as { OS: string }).OS = 'android';
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockDownload.mockResolvedValue({ uri: 'file:///cache/received-1.jpg' });

    await savePhotoFromUrl('https://example.com/a.jpg');

    expect(mockRequestPermissions).toHaveBeenCalledWith(true, ['photo']);
    expect(mockDownload).toHaveBeenCalledWith('https://example.com/a.jpg', expect.stringMatching(/^file:\/\/\/cache\/received-\d+\.jpg$/));
    expect(mockSaveToLibrary).toHaveBeenCalledWith('file:///cache/received-1.jpg');
  });

  it('does not download anything when the permission is denied', async () => {
    (Platform as { OS: string }).OS = 'ios';
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    await expect(savePhotoFromUrl('https://example.com/a.jpg')).rejects.toThrow('保存が許可されていません');
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockSaveToLibrary).not.toHaveBeenCalled();
  });

  it('opens the url in a new tab on web', async () => {
    (Platform as { OS: string }).OS = 'web';
    const open = jest.fn();
    (globalThis as { window?: unknown }).window = { open };

    await savePhotoFromUrl('https://example.com/a.jpg');

    expect(open).toHaveBeenCalledWith('https://example.com/a.jpg', '_blank');
    delete (globalThis as { window?: unknown }).window;
  });
});

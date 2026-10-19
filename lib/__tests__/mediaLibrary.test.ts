import { Platform } from 'react-native';

jest.mock('expo-media-library/legacy', () => ({
  getAssetInfoAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  MediaType: { photo: 'photo' },
  SortBy: { creationTime: 'creationTime' },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import * as MediaLibrary from 'expo-media-library/legacy';
import { getLibraryPhotoIds, resolvePhotoUriById } from '../mediaLibrary';
/* eslint-enable import/first */

const mockGetAssetInfo = MediaLibrary.getAssetInfoAsync as jest.Mock;
const mockGetAssets = MediaLibrary.getAssetsAsync as jest.Mock;
const originalPlatformOS = Platform.OS;

beforeEach(() => {
  mockGetAssetInfo.mockReset();
  mockGetAssets.mockReset();
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

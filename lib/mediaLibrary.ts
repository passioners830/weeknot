import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function requestPermission(): Promise<boolean> {
  // 写真のみ使うため、AUDIO権限は要求しない（AndroidManifestに未宣言だとエラーになる）
  const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  return status === 'granted';
}

export async function getRecentPhotos(limit = 30): Promise<MediaLibrary.Asset[]> {
  const result = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.photo,
    sortBy: [MediaLibrary.SortBy.creationTime],
    first: limit,
    createdAfter: Date.now() - ONE_WEEK_MS,
  });
  return result.assets;
}

// Webにはカメラロールが無いので、整理画面のモック写真（id 100〜107）と同じIDを返す
const WEB_MOCK_PHOTO_IDS = Array.from({ length: 8 }, (_, i) => String(100 + i));

export async function getLibraryPhotoIds(limit = 90): Promise<string[]> {
  if (Platform.OS === 'web') return WEB_MOCK_PHOTO_IDS;
  const result = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.photo,
    sortBy: [MediaLibrary.SortBy.creationTime],
    first: limit,
  });
  return result.assets.map((asset) => asset.id);
}

export async function resolvePhotoUriById(assetId: string): Promise<string> {
  if (Platform.OS === 'web') return `https://picsum.photos/id/${assetId}/300/400`;
  // AndroidのアセットidはMediaStoreの行IDそのもの。getAssetInfoAsync(id)はAndroid実機で
  // 取得できずnullになり写真が表示されなかったため、content URIを直接組み立てる
  if (Platform.OS === 'android') return `content://media/external/images/media/${assetId}`;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    return info?.localUri ?? info?.uri ?? `ph://${assetId}`;
  } catch {
    return `ph://${assetId}`;
  }
}

export async function resolveDisplayUri(asset: MediaLibrary.Asset): Promise<string> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset);
    return info.localUri ?? asset.uri;
  } catch {
    return asset.uri;
  }
}

export async function deletePhotos(assetIds: string[]): Promise<void> {
  if (assetIds.length === 0) return;
  await MediaLibrary.deleteAssetsAsync(assetIds);
}

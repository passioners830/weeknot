import * as MediaLibrary from 'expo-media-library/legacy';

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

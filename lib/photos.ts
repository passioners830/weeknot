import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { Photo } from '../types';

const BUCKET = 'highlight-photos';
const MAX_UPLOAD_WIDTH = 1080;
const JPEG_QUALITY = 0.7;

// カメラ撮影そのままの解像度（4000x3000等、数MB）を毎回アップロード・表示すると、
// フィードで複数枚を同時に表示する際に実機のメモリを圧迫して画像が表示されなくなることがあった。
// サムネイル表示に十分なサイズへ縮小してからアップロードする。
async function prepareForUpload(uri: string): Promise<string> {
  if (Platform.OS === 'web') return uri;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_UPLOAD_WIDTH } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

// ネイティブのfile://等のURIはfetch().blob()では正しく読み込めないことがあるため、
// Web以外はexpo-file-systemでbase64として直接読み込む
async function readAsUploadBody(uri: string): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.blob();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decode(base64);
}

export async function uploadHighlightPhotos(highlightId: string, photos: Photo[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  for (let i = 0; i < photos.length; i++) {
    const uploadUri = await prepareForUpload(photos[i].uri);
    const body = await readAsUploadBody(uploadUri);
    const path = `${user.id}/${highlightId}/${i}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) throw error;
  }
}

export async function getHighlightPhotoUrls(authorId: string, highlightId: string): Promise<string[]> {
  const prefix = `${authorId}/${highlightId}`;
  const { data: files, error } = await supabase.storage.from(BUCKET).list(prefix);
  if (error) throw error;
  if (!files || files.length === 0) return [];

  const paths = files.map((f) => `${prefix}/${f.name}`);
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (signError) throw signError;

  return (signed ?? []).map((s) => s.signedUrl).filter((url): url is string => Boolean(url));
}

// アップロード時のパス規約（{user_id}/{highlight_id}/{n}.jpg）から、n枚目の署名付きURLを返す
export async function getHighlightPhotoUrl(
  authorId: string,
  highlightId: string,
  photoIndex: number
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(`${authorId}/${highlightId}/${photoIndex}.jpg`, 60 * 60);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function deleteHighlightPhotos(authorId: string, highlightId: string): Promise<void> {
  const prefix = `${authorId}/${highlightId}`;
  const { data: files, error } = await supabase.storage.from(BUCKET).list(prefix);
  if (error) throw error;
  if (!files || files.length === 0) return;

  const paths = files.map((f) => `${prefix}/${f.name}`);
  const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
  if (removeError) throw removeError;
}

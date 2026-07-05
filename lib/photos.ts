import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { Photo } from '../types';

const BUCKET = 'highlight-photos';

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
    const body = await readAsUploadBody(photos[i].uri);
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

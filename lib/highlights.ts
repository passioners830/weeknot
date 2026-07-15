import { deleteHighlightPhotos } from './photos';
import { supabase } from './supabase';

export type Visibility = 'private' | 'circle' | 'public';

export type Highlight = {
  id: string;
  createdAt: string;
  photoCount: number;
  visibility: Visibility;
  circleIds: string[];
};

export type FeedItem = {
  id: string;
  createdAt: string;
  photoCount: number;
  visibility: Visibility;
  authorId: string;
  authorName: string;
  isMine: boolean;
};

const FEED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function getFeed(): Promise<FeedItem[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // フィードは直近1週間の投稿のみ（自分の投稿も含む）。
  // 自分の過去の投稿はHistoryScreen側で（遅延読み込みつきで）全件見られる。
  const cutoff = new Date(Date.now() - FEED_WINDOW_MS).toISOString();
  const { data: highlights, error } = await supabase
    .from('highlights')
    .select('id, created_at, photo_count, visibility, user_id')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!highlights || highlights.length === 0) return [];

  const userIds = [...new Set(highlights.map((h) => h.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  if (profilesError) throw profilesError;

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return highlights.map((h) => ({
    id: h.id,
    createdAt: h.created_at,
    photoCount: h.photo_count,
    visibility: h.visibility as Visibility,
    authorId: h.user_id,
    authorName: nameById.get(h.user_id) ?? '不明なユーザー',
    isMine: h.user_id === user?.id,
  }));
}

export async function getHighlights(): Promise<Highlight[]> {
  const { data, error } = await supabase
    .from('highlights')
    .select('id, created_at, photo_count, visibility, highlight_circles(circle_id)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((h) => ({
    id: h.id,
    createdAt: h.created_at,
    photoCount: h.photo_count,
    visibility: h.visibility as Visibility,
    circleIds: (h.highlight_circles ?? []).map((hc) => hc.circle_id),
  }));
}

export async function publishHighlight(params: {
  photoCount: number;
  visibility: Visibility;
  circleIds: string[];
}): Promise<Highlight> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { data, error } = await supabase
    .from('highlights')
    .insert({
      user_id: user.id,
      photo_count: params.photoCount,
      visibility: params.visibility,
    })
    .select('id, created_at, photo_count, visibility')
    .single();
  if (error) throw error;

  if (params.visibility === 'circle' && params.circleIds.length > 0) {
    const { error: linkError } = await supabase
      .from('highlight_circles')
      .insert(params.circleIds.map((circleId) => ({ highlight_id: data.id, circle_id: circleId })));
    if (linkError) throw linkError;
  }

  return {
    id: data.id,
    createdAt: data.created_at,
    photoCount: data.photo_count,
    visibility: data.visibility as Visibility,
    circleIds: params.visibility === 'circle' ? params.circleIds : [],
  };
}

export async function updateHighlightVisibility(
  highlightId: string,
  visibility: Visibility,
  circleIds: string[]
): Promise<void> {
  const { error } = await supabase.from('highlights').update({ visibility }).eq('id', highlightId);
  if (error) throw error;

  const { error: deleteError } = await supabase
    .from('highlight_circles')
    .delete()
    .eq('highlight_id', highlightId);
  if (deleteError) throw deleteError;

  if (visibility === 'circle' && circleIds.length > 0) {
    const { error: insertError } = await supabase
      .from('highlight_circles')
      .insert(circleIds.map((circleId) => ({ highlight_id: highlightId, circle_id: circleId })));
    if (insertError) throw insertError;
  }
}

export async function deleteHighlight(highlightId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  await deleteHighlightPhotos(user.id, highlightId);

  const { error } = await supabase.from('highlights').delete().eq('id', highlightId);
  if (error) throw error;
}

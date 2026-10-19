import { getBlockedUserIds } from './blocks';
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

export type Page<T> = { items: T[]; nextCursor: string | null };

const FEED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;

// cursorは前ページ最後の要素のcreated_at。件数が積み重なっても常に「その時刻より前」を
// 取得するだけなので、取得中に新しい投稿が増えても後続ページが重複・欠落しない
export async function getFeed(options?: {
  cursor?: string | null;
  limit?: number;
}): Promise<Page<FeedItem>> {
  const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // フィードは直近1週間の投稿のみ（自分の投稿も含む）。
  // 自分の過去の投稿はHistoryScreen側で（遅延読み込みつきで）全件見られる。
  const cutoff = new Date(Date.now() - FEED_WINDOW_MS).toISOString();
  let query = supabase
    .from('highlights')
    .select('id, created_at, photo_count, visibility, user_id')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (options?.cursor) {
    query = query.lt('created_at', options.cursor);
  }
  const { data: highlights, error } = await query;
  if (error) throw error;
  if (!highlights || highlights.length === 0) return { items: [], nextCursor: null };

  const nextCursor = highlights.length === limit ? highlights[highlights.length - 1].created_at : null;

  const blockedIds = new Set(await getBlockedUserIds());
  const visible = highlights.filter((h) => !blockedIds.has(h.user_id));

  const userIds = [...new Set(visible.map((h) => h.user_id))];
  const { data: profiles, error: profilesError } =
    userIds.length > 0
      ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
      : { data: [] as { id: string; display_name: string | null }[], error: null };
  if (profilesError) throw profilesError;

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return {
    items: visible.map((h) => ({
      id: h.id,
      createdAt: h.created_at,
      photoCount: h.photo_count,
      visibility: h.visibility as Visibility,
      authorId: h.user_id,
      authorName: nameById.get(h.user_id) ?? '不明なユーザー',
      isMine: h.user_id === user?.id,
    })),
    nextCursor,
  };
}

type OwnHighlightRow = {
  id: string;
  created_at: string;
  photo_count: number;
  visibility: string;
  highlight_circles: { circle_id: string }[] | null;
};

function toHighlight(h: OwnHighlightRow): Highlight {
  return {
    id: h.id,
    createdAt: h.created_at,
    photoCount: h.photo_count,
    visibility: h.visibility as Visibility,
    circleIds: (h.highlight_circles ?? []).map((hc) => hc.circle_id),
  };
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');
  return user.id;
}

// 閲覧権限のポリシーは他人の公開・サークル投稿や（管理者なら）全投稿も読めるため、
// 「自分の投稿」はuser_idで明示的に絞る
export async function getHighlights(options?: {
  cursor?: string | null;
  limit?: number;
}): Promise<Page<Highlight>> {
  const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
  const userId = await requireUserId();
  let query = supabase
    .from('highlights')
    .select('id, created_at, photo_count, visibility, highlight_circles(circle_id)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (options?.cursor) {
    query = query.lt('created_at', options.cursor);
  }
  const { data, error } = await query;
  if (error) throw error;

  const items = (data ?? []).map(toHighlight);

  return { items, nextCursor: items.length === limit ? items[items.length - 1].createdAt : null };
}

// 自分の投稿のうち、start以上end未満に作られたもの（新しい順）
export async function getHighlightsInRange(start: Date, end: Date): Promise<Highlight[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('highlights')
    .select('id, created_at, photo_count, visibility, highlight_circles(circle_id)')
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toHighlight);
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

import { supabase } from './supabase';

export type Comment = {
  id: string;
  highlightId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

export async function getCommentsForHighlights(
  highlightIds: string[]
): Promise<Record<string, Comment[]>> {
  if (highlightIds.length === 0) return {};

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('comments')
    .select('id, highlight_id, user_id, body, created_at')
    .in('highlight_id', highlightIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return {};

  const userIds = [...new Set(data.map((c) => c.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  if (profilesError) throw profilesError;
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const grouped: Record<string, Comment[]> = {};
  for (const row of data) {
    grouped[row.highlight_id] ??= [];
    grouped[row.highlight_id].push({
      id: row.id,
      highlightId: row.highlight_id,
      authorId: row.user_id,
      authorName:
        row.user_id === user?.id ? '自分' : nameById.get(row.user_id) ?? '不明なユーザー',
      body: row.body,
      createdAt: row.created_at,
      isMine: row.user_id === user?.id,
    });
  }
  return grouped;
}

export async function addComment(highlightId: string, body: string): Promise<Comment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { data, error } = await supabase
    .from('comments')
    .insert({ highlight_id: highlightId, user_id: user.id, body })
    .select('id, highlight_id, user_id, body, created_at')
    .single();
  if (error) throw error;

  return {
    id: data.id,
    highlightId: data.highlight_id,
    authorId: data.user_id,
    authorName: '自分',
    body: data.body,
    createdAt: data.created_at,
    isMine: true,
  };
}

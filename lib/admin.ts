import { supabase } from './supabase';

export type Report = {
  id: string;
  reason: string;
  createdAt: string;
  reporterId: string;
  reporterName: string;
  highlightId: string;
  authorId: string;
  authorName: string;
  authorSuspended: boolean;
};

export async function amIAppAdmin(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('is_app_admin')
    .eq('id', user.id)
    .single();
  if (error) return false;
  return data?.is_app_admin ?? false;
}

export async function getReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('id, reason, created_at, reporter_id, highlight_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const highlightIds = [...new Set(data.map((r) => r.highlight_id))];
  const { data: highlights, error: highlightsError } = await supabase
    .from('highlights')
    .select('id, user_id')
    .in('id', highlightIds);
  if (highlightsError) throw highlightsError;
  const authorByHighlight = new Map((highlights ?? []).map((h) => [h.id, h.user_id]));

  const userIds = [
    ...new Set([...data.map((r) => r.reporter_id), ...(highlights ?? []).map((h) => h.user_id)]),
  ];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, is_suspended')
    .in('id', userIds);
  if (profilesError) throw profilesError;
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return data.map((r) => {
    const authorId = authorByHighlight.get(r.highlight_id) ?? '';
    return {
      id: r.id,
      reason: r.reason,
      createdAt: r.created_at,
      reporterId: r.reporter_id,
      reporterName: profileById.get(r.reporter_id)?.display_name ?? '不明なユーザー',
      highlightId: r.highlight_id,
      authorId,
      authorName: profileById.get(authorId)?.display_name ?? '不明なユーザー',
      authorSuspended: profileById.get(authorId)?.is_suspended ?? false,
    };
  });
}

async function callSuspendFunction(targetUserId: string, action: 'ban' | 'unban'): Promise<void> {
  const { data, error } = await supabase.functions.invoke('suspend-user', {
    body: { targetUserId, action },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function suspendUser(userId: string): Promise<void> {
  await callSuspendFunction(userId, 'ban');
}

export async function unsuspendUser(userId: string): Promise<void> {
  await callSuspendFunction(userId, 'unban');
}

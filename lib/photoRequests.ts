import { supabase } from './supabase';

export type RequestStatus = 'pending' | 'accepted' | 'declined';

export type PhotoRequest = {
  id: string;
  highlightId: string;
  photoIndex: number;
  ownerId: string;
  requesterId: string;
  status: RequestStatus;
  createdAt: string;
  // 届いたリクエストなら依頼した人、送ったリクエストなら写真の持ち主の表示名
  otherName: string;
};

type RequestRow = {
  id: string;
  highlight_id: string;
  photo_index: number;
  owner_id: string;
  requester_id: string;
  status: string;
  created_at: string;
};

const OUTGOING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const UNKNOWN_USER = '不明なユーザー';
const ROW_COLUMNS = 'id, highlight_id, photo_index, owner_id, requester_id, status, created_at';
const UNIQUE_VIOLATION = '23505';

export function requestKey(highlightId: string, photoIndex: number): string {
  return `${highlightId}:${photoIndex}`;
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');
  return user.id;
}

async function fetchNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.display_name ?? UNKNOWN_USER]));
}

function toRequest(row: RequestRow, otherId: string, names: Map<string, string>): PhotoRequest {
  return {
    id: row.id,
    highlightId: row.highlight_id,
    photoIndex: row.photo_index,
    ownerId: row.owner_id,
    requesterId: row.requester_id,
    status: row.status as RequestStatus,
    createdAt: row.created_at,
    otherName: names.get(otherId) ?? UNKNOWN_USER,
  };
}

export async function requestPhoto(params: {
  highlightId: string;
  ownerId: string;
  photoIndex: number;
}): Promise<void> {
  const userId = await requireUserId();
  // owner_idはサーバー側のトリガーが投稿の持ち主で上書きするので、ここの値は信用されない
  const { error } = await supabase.from('photo_requests').insert({
    highlight_id: params.highlightId,
    photo_index: params.photoIndex,
    owner_id: params.ownerId,
    requester_id: userId,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new Error('すでにリクエスト済みです');
    throw error;
  }
}

// 自分宛ての、まだ返事をしていないリクエスト（新しい順）
export async function getIncomingRequests(): Promise<PhotoRequest[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('photo_requests')
    .select(ROW_COLUMNS)
    .eq('owner_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const names = await fetchNames(rows.map((r) => r.requester_id));
  return rows.map((r) => toRequest(r, r.requester_id, names));
}

// 自分が送ったリクエスト（直近30日、新しい順）
export async function getOutgoingRequests(): Promise<PhotoRequest[]> {
  const userId = await requireUserId();
  const since = new Date(Date.now() - OUTGOING_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('photo_requests')
    .select(ROW_COLUMNS)
    .eq('requester_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const names = await fetchNames(rows.map((r) => r.owner_id));
  return rows.map((r) => toRequest(r, r.owner_id, names));
}

// フィードの写真ビューアで「リクエスト済み」などを出し分けるための、自分のリクエストの状態一覧
export async function getMyRequestStatuses(): Promise<Record<string, RequestStatus>> {
  const userId = await requireUserId();
  const since = new Date(Date.now() - OUTGOING_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('photo_requests')
    .select('highlight_id, photo_index, status')
    .eq('requester_id', userId)
    .gte('created_at', since);
  if (error) throw error;

  const statuses: Record<string, RequestStatus> = {};
  for (const row of data ?? []) {
    statuses[requestKey(row.highlight_id, row.photo_index)] = row.status as RequestStatus;
  }
  return statuses;
}

export async function respondToRequest(requestId: string, decision: 'accepted' | 'declined'): Promise<void> {
  const { data, error } = await supabase
    .from('photo_requests')
    .update({ status: decision })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('このリクエストはすでに対応済みです');
}

export async function countIncomingPending(): Promise<number> {
  const userId = await requireUserId();
  const { count, error } = await supabase
    .from('photo_requests')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

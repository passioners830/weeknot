import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../lib/errors';
import { savePhotoFromUrl } from '../lib/mediaLibrary';
import {
  getIncomingRequests,
  getOutgoingRequests,
  respondToRequest,
  type PhotoRequest,
} from '../lib/photoRequests';
import { getHighlightPhotoUrl } from '../lib/photos';
import RequestsView from './RequestsView';

type Props = {
  // 返事をしてバッジの件数が変わるので、親に再取得してもらう
  onChanged: () => void;
};

export default function RequestsScreen({ onChanged }: Props) {
  const [incoming, setIncoming] = useState<PhotoRequest[]>([]);
  const [outgoing, setOutgoing] = useState<PhotoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [inc, out] = await Promise.all([getIncomingRequests(), getOutgoingRequests()]);
    setIncoming(inc);
    setOutgoing(out);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(getErrorMessage(e, 'リクエストの取得に失敗しました')))
      .finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await load();
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e, 'リクエストの取得に失敗しました'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleRespond = async (requestId: string, decision: 'accepted' | 'declined') => {
    setBusyId(requestId);
    setError(null);
    try {
      await respondToRequest(requestId, decision);
      setIncoming((prev) => prev.filter((r) => r.id !== requestId));
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e, '返事を送れませんでした'));
      // すでに対応済みだった場合などに備えて、最新の状態に合わせ直す
      load().catch(() => {});
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (request: PhotoRequest) => {
    setBusyId(request.id);
    setError(null);
    try {
      const url = await getHighlightPhotoUrl(request.ownerId, request.highlightId, request.photoIndex);
      if (!url) throw new Error('写真が見つかりませんでした。投稿が削除された可能性があります');
      await savePhotoFromUrl(url);
      setSavedIds((prev) => [...prev, request.id]);
    } catch (e) {
      setError(getErrorMessage(e, '写真を保存できませんでした'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <RequestsView
      incoming={incoming}
      outgoing={outgoing}
      loading={loading}
      refreshing={refreshing}
      error={error}
      busyId={busyId}
      savedIds={savedIds}
      onRefresh={handleRefresh}
      onRespond={handleRespond}
      onSave={handleSave}
    />
  );
}

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getHighlightPhotoUrl } from '../lib/photos';
import type { PhotoRequest } from '../lib/photoRequests';

type Props = {
  incoming: PhotoRequest[];
  outgoing: PhotoRequest[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  busyId: string | null;
  savedIds: string[];
  onRefresh: () => void;
  onRespond: (requestId: string, decision: 'accepted' | 'declined') => void;
  onSave: (request: PhotoRequest) => void;
};

const OUTGOING_STATUS_LABEL = {
  pending: '返事待ち',
  accepted: '送ってもらえました',
  declined: '見送られました',
} as const;

function RequestThumb({ request }: { request: PhotoRequest }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHighlightPhotoUrl(request.ownerId, request.highlightId, request.photoIndex)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        // サムネイルが出せなくても、リクエスト自体の操作は続けられる
      });
    return () => {
      cancelled = true;
    };
  }, [request.ownerId, request.highlightId, request.photoIndex]);

  if (!url) return <View style={styles.thumb} />;
  return <Image source={{ uri: url }} style={styles.thumb} />;
}

export default function RequestsView({
  incoming,
  outgoing,
  loading,
  refreshing,
  error,
  busyId,
  savedIds,
  onRefresh,
  onRespond,
  onSave,
}: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>写真のリクエスト</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.sectionTitle}>届いたリクエスト</Text>
      {incoming.length === 0 && <Text style={styles.empty}>届いているリクエストはありません</Text>}
      {incoming.map((request) => (
        <View key={request.id} style={styles.row}>
          <RequestThumb request={request} />
          <View style={styles.rowBody}>
            <Text style={styles.rowText}>{request.otherName}さんが、この写真を希望しています</Text>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => onRespond(request.id, 'accepted')}
                disabled={busyId === request.id}
              >
                <Text style={styles.primaryButtonText}>送る</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => onRespond(request.id, 'declined')}
                disabled={busyId === request.id}
              >
                <Text style={styles.secondaryButtonText}>断る</Text>
              </TouchableOpacity>
              {busyId === request.id && <ActivityIndicator size="small" />}
            </View>
          </View>
        </View>
      ))}

      <Text style={styles.sectionTitle}>送ったリクエスト</Text>
      {outgoing.length === 0 && (
        <Text style={styles.empty}>フィードの写真を開いて「この写真がほしい」を押すと、ここに表示されます</Text>
      )}
      {outgoing.map((request) => {
        const saved = savedIds.includes(request.id);
        return (
          <View key={request.id} style={styles.row}>
            <RequestThumb request={request} />
            <View style={styles.rowBody}>
              <Text style={styles.rowText}>{request.otherName}さんの写真</Text>
              <View style={styles.actions}>
                <Text
                  style={[styles.status, request.status === 'accepted' && styles.statusAccepted]}
                >
                  {OUTGOING_STATUS_LABEL[request.status]}
                </Text>
                {request.status === 'accepted' &&
                  (saved ? (
                    <Text style={styles.saved}>保存しました</Text>
                  ) : (
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => onSave(request)}
                      disabled={busyId === request.id}
                    >
                      <Text style={styles.primaryButtonText}>保存</Text>
                    </TouchableOpacity>
                  ))}
                {busyId === request.id && <ActivityIndicator size="small" />}
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  error: { color: '#e74c3c', fontSize: 13, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 16, marginBottom: 8 },
  empty: { color: '#999', fontSize: 13, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#eee' },
  rowBody: { flex: 1, justifyContent: 'space-between' },
  rowText: { fontSize: 13, color: '#333' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  primaryButton: {
    backgroundColor: '#333',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
  },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
  },
  secondaryButtonText: { color: '#555', fontSize: 13, fontWeight: '600' },
  status: { fontSize: 12, color: '#999' },
  statusAccepted: { color: '#2e9e5b', fontWeight: '600' },
  saved: { fontSize: 12, color: '#2e9e5b' },
});

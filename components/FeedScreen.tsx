import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { addComment, getCommentsForHighlights, Comment } from '../lib/comments';
import { getErrorMessage } from '../lib/errors';
import { getFeed, FeedItem } from '../lib/highlights';
import { getHighlightPhotoUrls } from '../lib/photos';
import { getReactionsForHighlights, toggleReaction, ReactionSummary } from '../lib/reactions';

const VISIBILITY_LABEL: Record<FeedItem['visibility'], string> = {
  private: 'プライベート',
  circle: 'サークル限定',
  public: '全体公開',
};

const QUICK_EMOJIS = ['❤️', '😂', '😮', '👍'];

export default function FeedScreen() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [reactions, setReactions] = useState<Record<string, ReactionSummary[]>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const feed = await getFeed();
      setItems(feed);
      const highlightIds = feed.map((f) => f.id);
      const [summaries, commentMap, photoEntries] = await Promise.all([
        getReactionsForHighlights(highlightIds),
        getCommentsForHighlights(highlightIds),
        Promise.all(
          feed.map(async (item) => [item.id, await getHighlightPhotoUrls(item.authorId, item.id)] as const)
        ),
      ]);
      setReactions(summaries);
      setComments(commentMap);
      setPhotoUrls(Object.fromEntries(photoEntries));
    } catch (e) {
      setError(getErrorMessage(e, 'フィードの取得に失敗しました'));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleReact = async (highlightId: string, emoji: string) => {
    const current = reactions[highlightId] ?? [];
    const existing = current.find((r) => r.emoji === emoji);
    const reactedByMe = existing?.reactedByMe ?? false;

    const next = current
      .map((r) =>
        r.emoji === emoji
          ? { ...r, count: r.count + (reactedByMe ? -1 : 1), reactedByMe: !reactedByMe }
          : r
      )
      .filter((r) => r.count > 0);
    if (!existing && !reactedByMe) {
      next.push({ emoji, count: 1, reactedByMe: true });
    }
    setReactions((prev) => ({ ...prev, [highlightId]: next }));

    try {
      await toggleReaction(highlightId, emoji, reactedByMe);
    } catch (e) {
      setReactions((prev) => ({ ...prev, [highlightId]: current }));
      setError(getErrorMessage(e, 'リアクションに失敗しました'));
    }
  };

  const handleSubmitComment = async (highlightId: string) => {
    const body = (drafts[highlightId] ?? '').trim();
    if (!body) return;

    setDrafts((prev) => ({ ...prev, [highlightId]: '' }));
    try {
      const comment = await addComment(highlightId, body);
      setComments((prev) => ({
        ...prev,
        [highlightId]: [...(prev[highlightId] ?? []), comment],
      }));
    } catch (e) {
      setDrafts((prev) => ({ ...prev, [highlightId]: body }));
      setError(getErrorMessage(e, 'コメントの投稿に失敗しました'));
    }
  };

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
      <Text style={styles.title}>フィード</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {items.length === 0 && !error && (
        <Text style={styles.empty}>まだ公開されたハイライトがありません</Text>
      )}

      {items.map((item) => {
        const itemReactions = reactions[item.id] ?? [];
        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.author}>{item.isMine ? '自分' : item.authorName}</Text>
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleDateString('ja-JP')}
              </Text>
            </View>
            <Text style={styles.detail}>
              {item.photoCount}枚のハイライト ・ {VISIBILITY_LABEL[item.visibility]}
            </Text>

            {(photoUrls[item.id] ?? []).length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                {photoUrls[item.id].map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.photoThumb} />
                ))}
              </ScrollView>
            )}

            <View style={styles.reactionRow}>
              {QUICK_EMOJIS.map((emoji) => {
                const summary = itemReactions.find((r) => r.emoji === emoji);
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.reactionChip, summary?.reactedByMe && styles.reactionChipActive]}
                    onPress={() => handleReact(item.id, emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    {summary && summary.count > 0 && (
                      <Text
                        style={[
                          styles.reactionCount,
                          summary.reactedByMe && styles.reactionCountActive,
                        ]}
                      >
                        {summary.count}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.commentSection}>
              {(comments[item.id] ?? []).map((comment) => (
                <View key={comment.id} style={styles.commentRow}>
                  <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                  <Text style={styles.commentBody}>{comment.body}</Text>
                </View>
              ))}
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="コメントを追加..."
                  value={drafts[item.id] ?? ''}
                  onChangeText={(text) => setDrafts((prev) => ({ ...prev, [item.id]: text }))}
                  onSubmitEditing={() => handleSubmitComment(item.id)}
                />
                <TouchableOpacity onPress={() => handleSubmitComment(item.id)}>
                  <Text style={styles.commentSend}>送信</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 60,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  error: {
    color: '#e74c3c',
    fontSize: 13,
    marginBottom: 12,
  },
  empty: {
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  author: {
    fontSize: 14,
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  detail: {
    fontSize: 13,
    color: '#555',
  },
  photoRow: {
    marginTop: 10,
  },
  photoThumb: {
    width: 90,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 4,
  },
  reactionChipActive: {
    backgroundColor: '#fdecea',
    borderColor: '#e74c3c',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    color: '#666',
  },
  reactionCountActive: {
    color: '#e74c3c',
    fontWeight: '600',
  },
  commentSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
    paddingTop: 10,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '600',
  },
  commentBody: {
    fontSize: 12,
    color: '#444',
    flex: 1,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 10,
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  commentSend: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
});

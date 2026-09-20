import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { addComment, deleteComment, getCommentsForHighlights, Comment } from '../lib/comments';
import { getErrorMessage } from '../lib/errors';
import { deleteHighlight, getFeed, FeedItem } from '../lib/highlights';
import { getHighlightPhotoUrls } from '../lib/photos';
import { getReactionsForHighlights, toggleReaction, ReactionSummary } from '../lib/reactions';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const feed = await getFeed();
      setItems(feed);
      const highlightIds = feed.map((f) => f.id);
      const [summaries, commentMap] = await Promise.all([
        getReactionsForHighlights(highlightIds),
        getCommentsForHighlights(highlightIds),
      ]);
      setReactions(summaries);
      setComments(commentMap);
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

  const handleDeleteComment = async (highlightId: string, commentId: string) => {
    const prev = comments[highlightId] ?? [];
    setComments((p) => ({
      ...p,
      [highlightId]: prev.filter((c) => c.id !== commentId),
    }));
    try {
      await deleteComment(commentId);
    } catch (e) {
      setComments((p) => ({ ...p, [highlightId]: prev }));
      setError(getErrorMessage(e, 'コメントの削除に失敗しました'));
    }
  };

  const runDelete = async (highlightId: string) => {
    setDeletingId(highlightId);
    try {
      await deleteHighlight(highlightId);
      setItems((prev) => prev.filter((i) => i.id !== highlightId));
    } catch (e) {
      setError(getErrorMessage(e, '削除に失敗しました'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = (highlightId: string) => {
    // react-native-webのAlert.alertは何もしないダミー実装のため、Webではwindow.confirmを使う
    if (Platform.OS === 'web') {
      if (window.confirm('この投稿を削除しますか？\n写真とコメント・リアクションもすべて削除され、元に戻せません。')) {
        runDelete(highlightId);
      }
      return;
    }

    Alert.alert(
      'この投稿を削除しますか？',
      '写真とコメント・リアクションもすべて削除され、元に戻せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除する', style: 'destructive', onPress: () => runDelete(highlightId) },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>フィード</Text>
            {error && <Text style={styles.error}>{error}</Text>}
            {items.length === 0 && !error && (
              <Text style={styles.empty}>まだ公開されたハイライトがありません</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            reactions={reactions[item.id] ?? []}
            comments={comments[item.id] ?? []}
            draft={drafts[item.id] ?? ''}
            deleting={deletingId === item.id}
            onDraftChange={(text) => setDrafts((prev) => ({ ...prev, [item.id]: text }))}
            onReact={(emoji) => handleReact(item.id, emoji)}
            onSubmitComment={() => handleSubmitComment(item.id)}
            onDeleteComment={(commentId) => handleDeleteComment(item.id, commentId)}
            onDelete={() => handleDelete(item.id)}
            onOpenPhoto={(urls, index) => setViewer({ urls, index })}
          />
        )}
      />

      <Modal visible={!!viewer} transparent animationType="fade">
        <View style={styles.viewerOverlay}>
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewer(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>
          {viewer && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: viewer.index * SCREEN_WIDTH, y: 0 }}
            >
              {viewer.urls.map((url, i) => (
                <View key={i} style={styles.viewerPage}>
                  <Image source={{ uri: url }} style={styles.viewerImage} resizeMode="contain" />
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

type FeedCardProps = {
  item: FeedItem;
  reactions: ReactionSummary[];
  comments: Comment[];
  draft: string;
  deleting: boolean;
  onDraftChange: (text: string) => void;
  onReact: (emoji: string) => void;
  onSubmitComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onDelete: () => void;
  onOpenPhoto: (urls: string[], index: number) => void;
};

// 写真は各カードが画面内に表示された（マウントされた）時だけ読み込む。
// フィード全件分の写真を一度に読み込むと実機でメモリを圧迫し、画像が表示されなくなるため。
function FeedCard({
  item,
  reactions,
  comments,
  draft,
  deleting,
  onDraftChange,
  onReact,
  onSubmitComment,
  onDeleteComment,
  onDelete,
  onOpenPhoto,
}: FeedCardProps) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    getHighlightPhotoUrls(item.authorId, item.id)
      .then((urls) => {
        if (!cancelled) setPhotoUrls(urls);
      })
      .catch(() => {
        // 写真の取得に失敗しても、投稿自体（テキスト・リアクション等）は表示を続ける
      });
    return () => {
      cancelled = true;
    };
  }, [item.authorId, item.id]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.author}>{item.isMine ? '自分' : item.authorName}</Text>
        <View style={styles.cardHeaderRight}>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('ja-JP')}</Text>
          {item.isMine && (
            <TouchableOpacity onPress={onDelete} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator size="small" color="#e74c3c" />
              ) : (
                <Text style={styles.deleteLink}>削除</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={styles.detail}>
        {item.photoCount}枚のハイライト ・ {VISIBILITY_LABEL[item.visibility]}
      </Text>

      {photoUrls.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {photoUrls.map((url, i) => (
            <TouchableOpacity key={i} onPress={() => onOpenPhoto(photoUrls, i)} activeOpacity={0.85}>
              <Image source={{ uri: url }} style={styles.photoThumb} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.reactionRow}>
        {QUICK_EMOJIS.map((emoji) => {
          const summary = reactions.find((r) => r.emoji === emoji);
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.reactionChip, summary?.reactedByMe && styles.reactionChipActive]}
              onPress={() => onReact(emoji)}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {summary && summary.count > 0 && (
                <Text
                  style={[styles.reactionCount, summary.reactedByMe && styles.reactionCountActive]}
                >
                  {summary.count}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.commentSection}>
        {comments.map((comment) => (
          <View key={comment.id} style={styles.commentRow}>
            <Text style={styles.commentAuthor}>{comment.authorName}</Text>
            <Text style={styles.commentBody}>{comment.body}</Text>
            {comment.isMine && (
              <TouchableOpacity onPress={() => onDeleteComment(comment.id)}>
                <Text style={styles.commentDelete}>削除</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            placeholder="コメントを追加..."
            value={draft}
            onChangeText={onDraftChange}
            onSubmitEditing={onSubmitComment}
          />
          <TouchableOpacity onPress={onSubmitComment}>
            <Text style={styles.commentSend}>送信</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  deleteLink: {
    fontSize: 12,
    color: '#e74c3c',
    fontWeight: '600',
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
  commentDelete: {
    fontSize: 11,
    color: '#e74c3c',
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
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseText: {
    color: '#fff',
    fontSize: 18,
  },
  viewerPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
});

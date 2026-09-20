import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { addComment, deleteComment, getCommentsForHighlights, Comment } from '../lib/comments';
import { Circle, getCircles } from '../lib/circles';
import { getErrorMessage } from '../lib/errors';
import {
  deleteHighlight,
  getHighlights,
  updateHighlightVisibility,
  Highlight,
  Visibility,
} from '../lib/highlights';
import { getHighlightPhotoUrls } from '../lib/photos';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'private', label: 'プライベート' },
  { value: 'circle', label: 'サークル限定' },
  { value: 'public', label: '全体公開' },
];

const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: 'プライベート',
  circle: 'サークル限定',
  public: '全体公開',
};

export default function HistoryScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [photosByHighlight, setPhotosByHighlight] = useState<Record<string, string[]>>({});
  const [loadingPhotosId, setLoadingPhotosId] = useState<string | null>(null);
  const [commentsByHighlight, setCommentsByHighlight] = useState<Record<string, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [editVisibility, setEditVisibility] = useState<Visibility>('private');
  const [editCircleIds, setEditCircleIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUserId(user?.id ?? null);
        setHighlights(await getHighlights());
        setCircles(await getCircles());
      } catch (e) {
        setError(getErrorMessage(e, '履歴の取得に失敗しました'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleExpand = async (highlight: Highlight) => {
    if (expandedId === highlight.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(highlight.id);
    if (!photosByHighlight[highlight.id] && userId) {
      setLoadingPhotosId(highlight.id);
      try {
        const urls = await getHighlightPhotoUrls(userId, highlight.id);
        setPhotosByHighlight((prev) => ({ ...prev, [highlight.id]: urls }));
      } catch (e) {
        setError(getErrorMessage(e, '写真の取得に失敗しました'));
      } finally {
        setLoadingPhotosId(null);
      }
    }
    if (!commentsByHighlight[highlight.id]) {
      try {
        const grouped = await getCommentsForHighlights([highlight.id]);
        setCommentsByHighlight((prev) => ({ ...prev, [highlight.id]: grouped[highlight.id] ?? [] }));
      } catch (e) {
        setError(getErrorMessage(e, 'コメントの取得に失敗しました'));
      }
    }
  };

  const handleSubmitComment = async (highlightId: string) => {
    const body = (commentDrafts[highlightId] ?? '').trim();
    if (!body) return;

    setCommentDrafts((prev) => ({ ...prev, [highlightId]: '' }));
    try {
      const comment = await addComment(highlightId, body);
      setCommentsByHighlight((prev) => ({
        ...prev,
        [highlightId]: [...(prev[highlightId] ?? []), comment],
      }));
    } catch (e) {
      setCommentDrafts((prev) => ({ ...prev, [highlightId]: body }));
      setError(getErrorMessage(e, 'コメントの投稿に失敗しました'));
    }
  };

  const handleDeleteComment = async (highlightId: string, commentId: string) => {
    const prev = commentsByHighlight[highlightId] ?? [];
    setCommentsByHighlight((p) => ({
      ...p,
      [highlightId]: prev.filter((c) => c.id !== commentId),
    }));
    try {
      await deleteComment(commentId);
    } catch (e) {
      setCommentsByHighlight((p) => ({ ...p, [highlightId]: prev }));
      setError(getErrorMessage(e, 'コメントの削除に失敗しました'));
    }
  };

  const runDelete = async (highlight: Highlight) => {
    setDeletingId(highlight.id);
    try {
      await deleteHighlight(highlight.id);
      setHighlights((prev) => prev.filter((h) => h.id !== highlight.id));
      if (expandedId === highlight.id) setExpandedId(null);
    } catch (e) {
      setError(getErrorMessage(e, '削除に失敗しました'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = (highlight: Highlight) => {
    // react-native-webのAlert.alertは何もしないダミー実装のため、
    // Webではwindow.confirmを使う
    if (Platform.OS === 'web') {
      if (window.confirm('この投稿を削除しますか？\n写真とコメント・リアクションもすべて削除され、元に戻せません。')) {
        runDelete(highlight);
      }
      return;
    }

    Alert.alert(
      'この投稿を削除しますか？',
      '写真とコメント・リアクションもすべて削除され、元に戻せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除する', style: 'destructive', onPress: () => runDelete(highlight) },
      ]
    );
  };

  const openEdit = (highlight: Highlight) => {
    setEditingHighlight(highlight);
    setEditVisibility(highlight.visibility);
    setEditCircleIds(highlight.circleIds);
    setEditError(null);
  };

  const closeEdit = () => {
    setEditingHighlight(null);
    setEditError(null);
  };

  const toggleEditCircle = (id: string) => {
    setEditCircleIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleSaveEdit = async () => {
    if (!editingHighlight) return;
    if (editVisibility === 'circle' && editCircleIds.length === 0) {
      setEditError('サークルを1つ以上選んでください');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const circleIds = editVisibility === 'circle' ? editCircleIds : [];
      await updateHighlightVisibility(editingHighlight.id, editVisibility, circleIds);
      setHighlights((prev) =>
        prev.map((h) =>
          h.id === editingHighlight.id ? { ...h, visibility: editVisibility, circleIds } : h
        )
      );
      closeEdit();
    } catch (e) {
      setEditError(getErrorMessage(e, '更新に失敗しました'));
    } finally {
      setSavingEdit(false);
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>自分の投稿履歴</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {highlights.length === 0 && !error && (
        <Text style={styles.empty}>まだ公開したハイライトがありません</Text>
      )}

      {highlights.map((highlight) => {
        const expanded = expandedId === highlight.id;
        return (
          <View key={highlight.id} style={styles.card}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => toggleExpand(highlight)}
              activeOpacity={0.7}
            >
              <Text style={styles.date}>
                {new Date(highlight.createdAt).toLocaleDateString('ja-JP')}
              </Text>
              <Text style={styles.detail}>
                {highlight.photoCount}枚 ・ {VISIBILITY_LABEL[highlight.visibility]}
              </Text>
            </TouchableOpacity>

            {expanded && (
              <View style={styles.photoArea}>
                {loadingPhotosId === highlight.id && <ActivityIndicator style={styles.photoLoading} />}
                {(photosByHighlight[highlight.id] ?? []).length === 0 &&
                  loadingPhotosId !== highlight.id && (
                    <Text style={styles.noPhotos}>写真がありません</Text>
                  )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(photosByHighlight[highlight.id] ?? []).map((url, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setViewer({ urls: photosByHighlight[highlight.id], index: i })}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: url }} style={styles.photoThumb} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.editButton} onPress={() => openEdit(highlight)}>
                    <Text style={styles.editButtonText}>公開範囲を編集</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(highlight)}
                    disabled={deletingId === highlight.id}
                  >
                    {deletingId === highlight.id ? (
                      <ActivityIndicator size="small" color="#e74c3c" />
                    ) : (
                      <Text style={styles.deleteButtonText}>この投稿を削除</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.commentSection}>
                  {(commentsByHighlight[highlight.id] ?? []).map((comment) => (
                    <View key={comment.id} style={styles.commentRow}>
                      <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                      <Text style={styles.commentBody}>{comment.body}</Text>
                      {comment.isMine && (
                        <TouchableOpacity onPress={() => handleDeleteComment(highlight.id, comment.id)}>
                          <Text style={styles.commentDelete}>削除</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <View style={styles.commentInputRow}>
                    <TextInput
                      style={styles.commentInput}
                      placeholder="コメントを追加..."
                      value={commentDrafts[highlight.id] ?? ''}
                      onChangeText={(text) =>
                        setCommentDrafts((prev) => ({ ...prev, [highlight.id]: text }))
                      }
                      onSubmitEditing={() => handleSubmitComment(highlight.id)}
                    />
                    <TouchableOpacity onPress={() => handleSubmitComment(highlight.id)}>
                      <Text style={styles.commentSend}>送信</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <Modal visible={!!editingHighlight} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>公開範囲を編集</Text>
            <View style={styles.visibilityRow}>
              {VISIBILITY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.visibilityChip,
                    editVisibility === opt.value && styles.visibilityChipActive,
                  ]}
                  onPress={() => setEditVisibility(opt.value)}
                >
                  <Text
                    style={[
                      styles.visibilityChipText,
                      editVisibility === opt.value && styles.visibilityChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {editVisibility === 'circle' && (
              <View style={styles.editCircleChips}>
                {circles.map((circle) => (
                  <TouchableOpacity
                    key={circle.id}
                    style={[
                      styles.chip,
                      editCircleIds.includes(circle.id) && styles.chipActive,
                    ]}
                    onPress={() => toggleEditCircle(circle.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        editCircleIds.includes(circle.id) && styles.chipTextActive,
                      ]}
                    >
                      {circle.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {editError && <Text style={styles.error}>{editError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={closeEdit}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} disabled={savingEdit}>
                <Text style={styles.modalSave}>{savingEdit ? '保存中...' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  detail: {
    fontSize: 13,
    color: '#333',
  },
  photoArea: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
    paddingTop: 10,
  },
  photoLoading: {
    marginVertical: 8,
  },
  noPhotos: {
    fontSize: 12,
    color: '#999',
  },
  photoThumb: {
    width: 90,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  deleteButtonText: {
    fontSize: 13,
    color: '#e74c3c',
    fontWeight: '600',
  },
  editButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  editButtonText: {
    fontSize: 13,
    color: '#333',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 14,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  visibilityChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  visibilityChipActive: {
    backgroundColor: '#333',
    borderColor: '#333',
  },
  visibilityChipText: {
    fontSize: 13,
    color: '#333',
  },
  visibilityChipTextActive: {
    color: '#fff',
  },
  editCircleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipActive: {
    backgroundColor: '#333',
    borderColor: '#333',
  },
  chipText: {
    fontSize: 13,
    color: '#333',
  },
  chipTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
    marginTop: 18,
  },
  modalCancel: {
    color: '#888',
    fontSize: 14,
  },
  modalSave: {
    color: '#333',
    fontSize: 14,
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

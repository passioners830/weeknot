import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { addCircle, Circle, getCircles, joinCircleByCode } from '../lib/circles';
import { getErrorMessage } from '../lib/errors';
import { getHighlights, Highlight, publishHighlight, Visibility } from '../lib/highlights';
import { uploadHighlightPhotos } from '../lib/photos';
import type { Photo } from '../types';

type Props = {
  keptPhotos: Photo[];
  onReset: () => void;
};

type ModalMode = 'create' | 'join';

const VISIBILITY_OPTIONS: { value: Visibility; label: string; subtitle: string }[] = [
  { value: 'private', label: 'プライベート', subtitle: '自分のみ閲覧可能' },
  { value: 'circle', label: 'サークル限定', subtitle: '家族・友人グループ' },
  { value: 'public', label: '全体公開', subtitle: 'アプリ内の友達全員' },
];

export default function ShareScreen({ keptPhotos, onReset }: Props) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('circle');
  const [selectedCircleIds, setSelectedCircleIds] = useState<string[]>([]);
  const [published, setPublished] = useState<Highlight | null>(null);
  const [history, setHistory] = useState<Highlight[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [newCircleName, setNewCircleName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    getCircles().then(setCircles);
    getHighlights().then(setHistory);
  }, []);

  const toggleCircle = (id: string) => {
    setSelectedCircleIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const closeModal = () => {
    setModalVisible(false);
    setModalMode('create');
    setNewCircleName('');
    setJoinCode('');
    setJoinError(null);
  };

  const handleCreateCircle = async () => {
    const name = newCircleName.trim();
    if (!name) return;
    const circle = await addCircle(name);
    setCircles((prev) => [...prev, circle]);
    setSelectedCircleIds((prev) => [...prev, circle.id]);
    closeModal();
  };

  const handleJoinCircle = async () => {
    if (!joinCode.trim()) return;
    setJoinError(null);
    try {
      const circle = await joinCircleByCode(joinCode);
      setCircles((prev) =>
        prev.some((c) => c.id === circle.id) ? prev : [...prev, circle]
      );
      setSelectedCircleIds((prev) => [...prev, circle.id]);
      closeModal();
    } catch (e) {
      setJoinError(getErrorMessage(e, '参加に失敗しました'));
    }
  };

  const handleCopyCode = async (circle: Circle) => {
    try {
      await Clipboard.setStringAsync(circle.inviteCode);
      setCopiedId(circle.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // クリップボードが使えない環境では静かに失敗させる（コードは画面に表示済みなので手動コピー可能）
    }
  };

  const canPublish = visibility !== 'circle' || selectedCircleIds.length > 0;

  const handlePublish = async () => {
    setPublishing(true);
    setUploadError(null);
    try {
      const highlight = await publishHighlight({
        photoCount: keptPhotos.length,
        visibility,
        circleIds: visibility === 'circle' ? selectedCircleIds : [],
      });
      try {
        await uploadHighlightPhotos(highlight.id, keptPhotos);
      } catch (e) {
        setUploadError(getErrorMessage(e, '写真のアップロードに失敗しました'));
      }
      setPublished(highlight);
      setHistory((prev) => [highlight, ...prev]);
    } finally {
      setPublishing(false);
    }
  };

  const circleNames = (ids: string[]) =>
    ids
      .map((id) => circles.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join('、');

  if (published) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>公開しました</Text>
        <Text style={styles.subtitle}>
          {published.visibility === 'private' && '自分のみ閲覧できます'}
          {published.visibility === 'circle' && `${circleNames(published.circleIds)} に公開しました`}
          {published.visibility === 'public' && 'アプリ内の友達全員に公開しました'}
        </Text>
        {uploadError && <Text style={styles.error}>{uploadError}</Text>}
        <TouchableOpacity style={styles.primaryButton} onPress={onReset}>
          <Text style={styles.primaryButtonText}>もう一度整理する</Text>
        </TouchableOpacity>
        <HighlightHistory history={history} circleNames={circleNames} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>今週のハイライト</Text>
      <Text style={styles.subtitle}>{keptPhotos.length}枚を残しました</Text>
      <View style={styles.grid}>
        {keptPhotos.map((photo) => (
          <Image key={photo.id} source={{ uri: photo.uri }} style={styles.gridImage} />
        ))}
      </View>

      <Text style={styles.sectionLabel}>公開範囲を選択</Text>
      <View style={styles.visibilityRow}>
        {VISIBILITY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.visibilityCard, visibility === opt.value && styles.visibilityCardActive]}
            onPress={() => setVisibility(opt.value)}
          >
            <Text style={styles.visibilityLabel}>{opt.label}</Text>
            <Text style={styles.visibilitySubtitle}>{opt.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {visibility === 'circle' && (
        <View style={styles.circleSection}>
          <View style={styles.circleChips}>
            {circles.map((circle) => (
              <TouchableOpacity
                key={circle.id}
                style={[
                  styles.chip,
                  selectedCircleIds.includes(circle.id) && styles.chipActive,
                ]}
                onPress={() => toggleCircle(circle.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedCircleIds.includes(circle.id) && styles.chipTextActive,
                  ]}
                >
                  {circle.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.chipAdd}
              onPress={() => {
                setModalMode('create');
                setModalVisible(true);
              }}
            >
              <Text style={styles.chipAddText}>＋ 新しいサークル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chipAdd}
              onPress={() => {
                setModalMode('join');
                setModalVisible(true);
              }}
            >
              <Text style={styles.chipAddText}>招待コードで参加</Text>
            </TouchableOpacity>
          </View>

          {circles.length > 0 && (
            <View style={styles.inviteList}>
              <Text style={styles.inviteListLabel}>招待コード（家族・友人に伝えてください）</Text>
              {circles.map((circle) => (
                <View key={circle.id} style={styles.inviteRow}>
                  <Text style={styles.inviteCircleName}>{circle.name}</Text>
                  <Text style={styles.inviteCode}>{circle.inviteCode}</Text>
                  <TouchableOpacity onPress={() => handleCopyCode(circle)}>
                    <Text style={styles.inviteCopy}>
                      {copiedId === circle.id ? 'コピーしました' : 'コピー'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, (!canPublish || publishing) && styles.primaryButtonDisabled]}
        disabled={!canPublish || publishing}
        onPress={handlePublish}
      >
        <Text style={styles.primaryButtonText}>
          {publishing ? '公開中...' : '公開する'}
        </Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {modalMode === 'create' ? (
              <>
                <Text style={styles.modalTitle}>新しいサークル</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="例: 地元の友人"
                  value={newCircleName}
                  onChangeText={setNewCircleName}
                  autoFocus
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity onPress={closeModal}>
                    <Text style={styles.modalCancel}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCreateCircle}>
                    <Text style={styles.modalCreate}>作成</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>招待コードで参加</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="例: a1b2c3d4"
                  autoCapitalize="none"
                  value={joinCode}
                  onChangeText={setJoinCode}
                  autoFocus
                />
                {joinError && <Text style={styles.error}>{joinError}</Text>}
                <View style={styles.modalActions}>
                  <TouchableOpacity onPress={closeModal}>
                    <Text style={styles.modalCancel}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleJoinCircle}>
                    <Text style={styles.modalCreate}>参加</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function HighlightHistory({
  history,
  circleNames,
}: {
  history: Highlight[];
  circleNames: (ids: string[]) => string;
}) {
  if (history.length === 0) return null;
  return (
    <View style={styles.historySection}>
      <Text style={styles.sectionLabel}>公開履歴</Text>
      {history.map((h) => (
        <View key={h.id} style={styles.historyRow}>
          <Text style={styles.historyDate}>
            {new Date(h.createdAt).toLocaleDateString('ja-JP')}
          </Text>
          <Text style={styles.historyDetail}>
            {h.photoCount}枚 ・
            {h.visibility === 'private' && ' プライベート'}
            {h.visibility === 'circle' && ` ${circleNames(h.circleIds)}`}
            {h.visibility === 'public' && ' 全体公開'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  gridImage: {
    width: 100,
    height: 130,
    borderRadius: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    alignSelf: 'flex-start',
    marginTop: 28,
    marginBottom: 12,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  visibilityCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  visibilityCardActive: {
    borderColor: '#333',
    backgroundColor: '#f5f5f5',
  },
  visibilityLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  visibilitySubtitle: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  circleSection: {
    width: '100%',
    marginTop: 16,
  },
  circleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  chipAdd: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
  },
  chipAddText: {
    fontSize: 13,
    color: '#666',
  },
  inviteList: {
    width: '100%',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
    paddingTop: 12,
  },
  inviteListLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  inviteCircleName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  inviteCode: {
    fontSize: 13,
    color: '#555',
    fontFamily: 'monospace',
  },
  inviteCopy: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  error: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#333',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 28,
  },
  primaryButtonDisabled: {
    backgroundColor: '#ccc',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
    marginTop: 16,
  },
  modalCancel: {
    color: '#888',
    fontSize: 14,
  },
  modalCreate: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  historySection: {
    width: '100%',
    marginTop: 40,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  historyDate: {
    fontSize: 12,
    color: '#999',
  },
  historyDetail: {
    fontSize: 12,
    color: '#333',
  },
});

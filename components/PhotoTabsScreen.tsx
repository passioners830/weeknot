import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  MAX_TAB_NAME_LENGTH,
  assignPhotosToTab,
  countPhotosByTab,
  createPhotoTab,
  deletePhotoTab,
  getPhotoTabsState,
  getTabPhotoIds,
  renamePhotoTab,
  unassignPhotos,
  type PhotoTabsState,
} from '../lib/photoTabs';
import { getErrorMessage } from '../lib/errors';
import AssetThumb from './AssetThumb';
import PhotoPickerModal from './PhotoPickerModal';

const GAP = 6;
const PADDING = 12;
const WINDOW_WIDTH = Dimensions.get('window').width;
const PHOTO_COLUMNS = 3;
const PHOTO_SIZE = (WINDOW_WIDTH - PADDING * 2 - GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS;
const CARD_GAP = 12;
const CARD_SIZE = (WINDOW_WIDTH - PADDING * 2 - CARD_GAP) / 2;

type NameModalMode = 'create' | 'rename';

export default function PhotoTabsScreen() {
  const [state, setState] = useState<PhotoTabsState | null>(null);
  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const [nameModalMode, setNameModalMode] = useState<NameModalMode | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionPhotoId, setActionPhotoId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await getPhotoTabsState();
    setState(next);
    setOpenTabId((current) => (current && next.tabs.some((t) => t.id === current) ? current : null));
  }, []);

  useEffect(() => {
    refresh().catch((e) => setScreenError(getErrorMessage(e, 'タブの読み込みに失敗しました')));
  }, [refresh]);

  // 写真の画面でAndroidの戻るボタンを押したら、アプリを閉じずにタブ一覧へ戻る
  useEffect(() => {
    if (!openTabId) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpenTabId(null);
      return true;
    });
    return () => subscription.remove();
  }, [openTabId]);

  const runAction = async (action: () => Promise<void>, fallbackMessage: string) => {
    setScreenError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setScreenError(getErrorMessage(e, fallbackMessage));
    }
  };

  if (!state) {
    return <View style={styles.container} />;
  }

  const openTab = state.tabs.find((t) => t.id === openTabId) ?? null;
  const counts = countPhotosByTab(state);
  const photoIds = openTab ? getTabPhotoIds(state, openTab.id) : [];

  const openNameModal = (mode: NameModalMode) => {
    setNameDraft(mode === 'rename' && openTab ? openTab.name : '');
    setNameError(null);
    setNameModalMode(mode);
  };

  const handleSubmitName = async () => {
    setNameError(null);
    try {
      if (nameModalMode === 'rename' && openTab) {
        await renamePhotoTab(openTab.id, nameDraft);
      } else {
        const tab = await createPhotoTab(nameDraft);
        setOpenTabId(tab.id);
      }
      setNameModalMode(null);
      await refresh();
    } catch (e) {
      setNameError(getErrorMessage(e, 'タブを保存できませんでした'));
    }
  };

  const handleDeleteTab = () => {
    if (!openTab) return;
    const run = () => runAction(() => deletePhotoTab(openTab.id), 'タブを削除できませんでした');
    const message = 'タブ内の写真はカメラロールにそのまま残ります。';
    if (Platform.OS === 'web') {
      if (window.confirm(`「${openTab.name}」を削除しますか？\n${message}`)) run();
      return;
    }
    Alert.alert(`「${openTab.name}」を削除しますか？`, message, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除する', style: 'destructive', onPress: run },
    ]);
  };

  const handleAddPhotos = (assetIds: string[]) => {
    if (!openTab) return;
    setPickerVisible(false);
    runAction(() => assignPhotosToTab(assetIds, openTab.id), '写真を追加できませんでした');
  };

  const handleMovePhoto = (assetId: string, tabId: string) => {
    setActionPhotoId(null);
    runAction(() => assignPhotosToTab([assetId], tabId), '写真を移動できませんでした');
  };

  const handleRemovePhoto = (assetId: string) => {
    setActionPhotoId(null);
    runAction(() => unassignPhotos([assetId]), '写真を外せませんでした');
  };

  return (
    <View style={styles.container}>
      {screenError && <Text style={styles.error}>{screenError}</Text>}

      {!openTab ? (
        state.tabs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>まだタブがありません</Text>
            <Text style={styles.emptyText}>
              「家族」「旅行」など自分だけのタブを作って、写真を分けて見られます。
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => openNameModal('create')}>
              <Text style={styles.primaryButtonText}>タブを作る</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.cardGrid}>
            {state.tabs.map((tab) => {
              const coverId = getTabPhotoIds(state, tab.id)[0];
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.card}
                  onPress={() => setOpenTabId(tab.id)}
                  accessibilityLabel={`${tab.name}、${counts[tab.id] ?? 0}枚`}
                >
                  {coverId ? (
                    <AssetThumb assetId={coverId} size={CARD_SIZE} borderRadius={14} />
                  ) : (
                    <View style={styles.cardEmpty}>
                      <Text style={styles.cardEmptyText}>写真なし</Text>
                    </View>
                  )}
                  <Text style={styles.cardName} numberOfLines={1}>
                    {tab.name}
                  </Text>
                  <Text style={styles.cardCount}>{counts[tab.id] ?? 0}枚</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.card} onPress={() => openNameModal('create')}>
              <View style={styles.cardAdd}>
                <Text style={styles.cardAddPlus}>＋</Text>
                <Text style={styles.cardAddText}>タブを作る</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        )
      ) : (
        <>
          <View style={styles.tabHeader}>
            <TouchableOpacity onPress={() => setOpenTabId(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.back}>← 一覧</Text>
            </TouchableOpacity>
            <Text style={styles.tabTitle} numberOfLines={1}>
              {openTab.name}
            </Text>
            <TouchableOpacity onPress={() => openNameModal('rename')}>
              <Text style={styles.link}>名前を変更</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteTab}>
              <Text style={styles.linkDanger}>削除</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            key={openTab.id}
            data={photoIds}
            numColumns={PHOTO_COLUMNS}
            keyExtractor={(id) => id}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            ListEmptyComponent={<Text style={styles.gridEmpty}>このタブにはまだ写真がありません</Text>}
            renderItem={({ item: id }) => (
              <TouchableOpacity onPress={() => setActionPhotoId(id)}>
                <AssetThumb assetId={id} size={PHOTO_SIZE} />
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={() => setPickerVisible(true)}>
            <Text style={styles.primaryButtonText}>＋ 写真を追加</Text>
          </TouchableOpacity>
        </>
      )}

      <Modal visible={nameModalMode !== null} transparent animationType="fade" onRequestClose={() => setNameModalMode(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {nameModalMode === 'rename' ? 'タブ名を変更' : '新しいタブ'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="家族"
              value={nameDraft}
              onChangeText={setNameDraft}
              maxLength={MAX_TAB_NAME_LENGTH}
              autoFocus
            />
            {nameError && <Text style={styles.modalError}>{nameError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setNameModalMode(null)}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSubmitName}>
                <Text style={styles.modalSave}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={actionPhotoId !== null} transparent animationType="fade" onRequestClose={() => setActionPhotoId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {state.tabs
              .filter((t) => t.id !== openTabId)
              .map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.actionRow}
                  onPress={() => actionPhotoId && handleMovePhoto(actionPhotoId, tab.id)}
                >
                  <Text style={styles.actionText}>「{tab.name}」へ移動</Text>
                </TouchableOpacity>
              ))}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => actionPhotoId && handleRemovePhoto(actionPhotoId)}
            >
              <Text style={styles.actionTextDanger}>このタブから外す</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionRow} onPress={() => setActionPhotoId(null)}>
              <Text style={styles.actionCancel}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PhotoPickerModal
        visible={pickerVisible}
        tabName={openTab?.name ?? ''}
        alreadyInTabIds={photoIds}
        onClose={() => setPickerVisible(false)}
        onConfirm={handleAddPhotos}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  error: { color: '#e74c3c', fontSize: 12, paddingHorizontal: PADDING, marginTop: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyText: { fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center' },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    paddingHorizontal: PADDING,
    paddingTop: 16,
    paddingBottom: 24,
  },
  card: { width: CARD_SIZE },
  cardEmpty: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 14,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmptyText: { fontSize: 12, color: '#aaa' },
  cardAdd: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAddPlus: { fontSize: 28, color: '#888' },
  cardAddText: { fontSize: 13, color: '#888', marginTop: 4 },
  cardName: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  cardCount: { fontSize: 12, color: '#999', marginTop: 2 },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: PADDING,
    paddingTop: 16,
    paddingBottom: 10,
  },
  back: { fontSize: 13, color: '#666' },
  tabTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  link: { fontSize: 13, color: '#666' },
  linkDanger: { fontSize: 13, color: '#e74c3c' },
  grid: { paddingHorizontal: PADDING, paddingBottom: 12, flexGrow: 1 },
  row: { gap: GAP, marginBottom: GAP },
  gridEmpty: { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 48 },
  primaryButton: {
    backgroundColor: '#333',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    alignSelf: 'center',
    marginVertical: 16,
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: { width: '80%', backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  modalError: { color: '#e74c3c', fontSize: 12, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 16 },
  modalCancel: { color: '#888', fontSize: 14 },
  modalSave: { color: '#333', fontSize: 14, fontWeight: '600' },
  actionRow: { paddingVertical: 12, alignItems: 'center' },
  actionText: { fontSize: 15, color: '#333' },
  actionTextDanger: { fontSize: 15, color: '#e74c3c' },
  actionCancel: { fontSize: 15, color: '#888' },
});

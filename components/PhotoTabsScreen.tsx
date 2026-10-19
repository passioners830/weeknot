import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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

const COLUMNS = 3;
const GAP = 6;
const PADDING = 12;
const THUMB_SIZE = (Dimensions.get('window').width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

type NameModalMode = 'create' | 'rename';

export default function PhotoTabsScreen() {
  const [state, setState] = useState<PhotoTabsState | null>(null);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [nameModalMode, setNameModalMode] = useState<NameModalMode | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionPhotoId, setActionPhotoId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await getPhotoTabsState();
    setState(next);
    setSelectedTabId((current) =>
      current && next.tabs.some((t) => t.id === current) ? current : (next.tabs[0]?.id ?? null)
    );
  }, []);

  useEffect(() => {
    refresh().catch((e) => setScreenError(getErrorMessage(e, 'タブの読み込みに失敗しました')));
  }, [refresh]);

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

  const selectedTab = state.tabs.find((t) => t.id === selectedTabId) ?? null;
  const counts = countPhotosByTab(state);
  const photoIds = selectedTab ? getTabPhotoIds(state, selectedTab.id) : [];

  const openNameModal = (mode: NameModalMode) => {
    setNameDraft(mode === 'rename' && selectedTab ? selectedTab.name : '');
    setNameError(null);
    setNameModalMode(mode);
  };

  const handleSubmitName = async () => {
    setNameError(null);
    try {
      if (nameModalMode === 'rename' && selectedTab) {
        await renamePhotoTab(selectedTab.id, nameDraft);
      } else {
        const tab = await createPhotoTab(nameDraft);
        setSelectedTabId(tab.id);
      }
      setNameModalMode(null);
      await refresh();
    } catch (e) {
      setNameError(getErrorMessage(e, 'タブを保存できませんでした'));
    }
  };

  const handleDeleteTab = () => {
    if (!selectedTab) return;
    const run = () => runAction(() => deletePhotoTab(selectedTab.id), 'タブを削除できませんでした');
    const message = 'タブ内の写真はカメラロールにそのまま残ります。';
    if (Platform.OS === 'web') {
      if (window.confirm(`「${selectedTab.name}」を削除しますか？\n${message}`)) run();
      return;
    }
    Alert.alert(`「${selectedTab.name}」を削除しますか？`, message, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除する', style: 'destructive', onPress: run },
    ]);
  };

  const handleAddPhotos = (assetIds: string[]) => {
    if (!selectedTab) return;
    setPickerVisible(false);
    runAction(() => assignPhotosToTab(assetIds, selectedTab.id), '写真を追加できませんでした');
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
      <View style={styles.chipBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {state.tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.chip, tab.id === selectedTabId && styles.chipActive]}
              onPress={() => setSelectedTabId(tab.id)}
            >
              <Text style={[styles.chipText, tab.id === selectedTabId && styles.chipTextActive]}>
                {tab.name} {counts[tab.id] ?? 0}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.chipAdd} onPress={() => openNameModal('create')}>
            <Text style={styles.chipAddText}>＋ タブを作る</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {screenError && <Text style={styles.error}>{screenError}</Text>}

      {!selectedTab ? (
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
        <>
          <View style={styles.tabHeader}>
            <Text style={styles.tabTitle} numberOfLines={1}>
              {selectedTab.name}
            </Text>
            <TouchableOpacity onPress={() => openNameModal('rename')}>
              <Text style={styles.link}>名前を変更</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteTab}>
              <Text style={styles.linkDanger}>削除</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            key={selectedTab.id}
            data={photoIds}
            numColumns={COLUMNS}
            keyExtractor={(id) => id}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            ListEmptyComponent={
              <Text style={styles.gridEmpty}>このタブにはまだ写真がありません</Text>
            }
            renderItem={({ item: id }) => (
              <TouchableOpacity onPress={() => setActionPhotoId(id)}>
                <AssetThumb assetId={id} size={THUMB_SIZE} />
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={() => setPickerVisible(true)}>
            <Text style={styles.primaryButtonText}>＋ 写真を追加</Text>
          </TouchableOpacity>
        </>
      )}

      <Modal visible={nameModalMode !== null} transparent animationType="fade">
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

      <Modal visible={actionPhotoId !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {state.tabs
              .filter((t) => t.id !== selectedTabId)
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
        tabName={selectedTab?.name ?? ''}
        alreadyInTabIds={photoIds}
        onClose={() => setPickerVisible(false)}
        onConfirm={handleAddPhotos}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  chipBar: { paddingTop: 12 },
  chips: { paddingHorizontal: PADDING, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#f2f2f2',
  },
  chipActive: { backgroundColor: '#333' },
  chipText: { fontSize: 13, color: '#666' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  chipAdd: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
  },
  chipAddText: { fontSize: 13, color: '#666' },
  error: { color: '#e74c3c', fontSize: 12, paddingHorizontal: PADDING, marginTop: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyText: { fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center' },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: PADDING,
    paddingTop: 16,
    paddingBottom: 10,
  },
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

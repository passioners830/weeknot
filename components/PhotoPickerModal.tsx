import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getLibraryPhotoIds, requestPermission } from '../lib/mediaLibrary';
import AssetThumb from './AssetThumb';

const COLUMNS = 3;
const GAP = 6;
const PADDING = 12;
const THUMB_SIZE = (Dimensions.get('window').width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

type LoadState = 'loading' | 'denied' | 'ready';

type Props = {
  visible: boolean;
  tabName: string;
  alreadyInTabIds: string[];
  onClose: () => void;
  onConfirm: (assetIds: string[]) => void;
};

export default function PhotoPickerModal({ visible, tabName, alreadyInTabIds, onClose, onConfirm }: Props) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setSelectedIds([]);
    setLoadState('loading');
    (async () => {
      const granted = Platform.OS === 'web' || (await requestPermission());
      if (!granted) {
        setLoadState('denied');
        return;
      }
      setPhotoIds(await getLibraryPhotoIds());
      setLoadState('ready');
    })().catch(() => setLoadState('denied'));
  }, [visible]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>キャンセル</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            「{tabName}」に追加
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {loadState === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        )}
        {loadState === 'denied' && (
          <View style={styles.center}>
            <Text style={styles.centerTitle}>カメラロールへのアクセスが必要です</Text>
            <Text style={styles.centerText}>設定アプリで写真へのアクセスを許可してください</Text>
          </View>
        )}
        {loadState === 'ready' && (
          <FlatList
            data={photoIds}
            numColumns={COLUMNS}
            keyExtractor={(id) => id}
            extraData={selectedIds}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            renderItem={({ item: id }) => {
              const alreadyIn = alreadyInTabIds.includes(id);
              const selected = selectedIds.includes(id);
              return (
                <TouchableOpacity
                  disabled={alreadyIn}
                  onPress={() => toggle(id)}
                  style={[styles.thumbWrapper, alreadyIn && styles.thumbDim]}
                >
                  <AssetThumb assetId={id} size={THUMB_SIZE} />
                  {(alreadyIn || selected) && (
                    <View style={[styles.checkBadge, alreadyIn && styles.checkBadgeMuted]}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        <TouchableOpacity
          style={[styles.confirmButton, selectedIds.length === 0 && styles.confirmButtonDisabled]}
          disabled={selectedIds.length === 0}
          onPress={() => onConfirm(selectedIds)}
        >
          <Text style={styles.confirmText}>追加（{selectedIds.length}枚）</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    paddingBottom: 12,
  },
  cancel: { fontSize: 14, color: '#888', width: 80 },
  headerSpacer: { width: 80 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  centerTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  centerText: { fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center' },
  grid: { paddingHorizontal: PADDING, paddingBottom: 20 },
  row: { gap: GAP, marginBottom: GAP },
  thumbWrapper: { position: 'relative' },
  thumbDim: { opacity: 0.4 },
  checkBadgeMuted: { backgroundColor: '#999' },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  confirmButton: {
    backgroundColor: '#333',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  confirmButtonDisabled: { backgroundColor: '#ccc' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

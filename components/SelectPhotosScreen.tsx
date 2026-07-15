import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Photo } from '../types';

export const MAX_SELECTABLE_PHOTOS = 7;

type Props = {
  photos: Photo[];
  onConfirm: (selected: Photo[]) => void;
  onBack: () => void;
};

export default function SelectPhotosScreen({ photos, onConfirm, onBack }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    photos.slice(0, MAX_SELECTABLE_PHOTOS).map((p) => p.id)
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTABLE_PHOTOS) return prev;
      return [...prev, id];
    });
  };

  if (photos.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyArea}>
          <Text style={styles.emptyTitle}>キープした写真がありません</Text>
          <Text style={styles.emptyText}>もう一度写真を整理し直しましょう</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>整理に戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← 整理に戻る</Text>
      </TouchableOpacity>
      <Text style={styles.title}>投稿する写真を選択</Text>
      <Text style={styles.subtitle}>
        {selectedIds.length} / {MAX_SELECTABLE_PHOTOS} 枚選択中
      </Text>
      <ScrollView contentContainerStyle={styles.grid}>
        {photos.map((photo) => {
          const selected = selectedIds.includes(photo.id);
          return (
            <TouchableOpacity
              key={photo.id}
              onPress={() => toggle(photo.id)}
              style={styles.thumbWrapper}
            >
              <Image
                source={{ uri: photo.uri }}
                style={[styles.thumb, selected && styles.thumbSelected]}
              />
              {selected && (
                <View style={styles.checkBadge}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity
        style={[styles.primaryButton, selectedIds.length === 0 && styles.primaryButtonDisabled]}
        disabled={selectedIds.length === 0}
        onPress={() => onConfirm(photos.filter((p) => selectedIds.includes(p.id)))}
      >
        <Text style={styles.primaryButtonText}>次へ（{selectedIds.length}枚）</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  backLink: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backLinkText: {
    fontSize: 13,
    color: '#666',
  },
  emptyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 20,
  },
  thumbWrapper: {
    position: 'relative',
  },
  thumb: {
    width: 100,
    height: 130,
    borderRadius: 8,
    opacity: 0.4,
  },
  thumbSelected: {
    opacity: 1,
  },
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
  checkText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#333',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginVertical: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: '#ccc',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

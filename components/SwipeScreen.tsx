import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { deletePhotos, getRecentPhotos, requestPermission, resolveDisplayUri } from '../lib/mediaLibrary';
import type { Photo } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_HEIGHT = CARD_WIDTH * 1.3;

type SwipeDirection = 'keep' | 'delete';
type LoadState = 'loading' | 'denied' | 'ready';

const MOCK_PHOTOS: Photo[] = Array.from({ length: 8 }, (_, i) => ({
  id: String(100 + i),
  uri: `https://picsum.photos/id/${100 + i}/600/800`,
}));

type Props = {
  onDone: (keptPhotos: Photo[]) => void;
};

export default function SwipeScreen({ onDone }: Props) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState<Photo[]>([]);
  const [deletedAssetIds, setDeletedAssetIds] = useState<string[]>([]);

  const position = useRef(new Animated.ValueXY()).current;

  const loadPhotos = async () => {
    setLoadState('loading');
    setIndex(0);
    setKept([]);
    setDeletedAssetIds([]);

    if (Platform.OS === 'web') {
      setPhotos(MOCK_PHOTOS);
      setLoadState('ready');
      return;
    }

    const granted = await requestPermission();
    if (!granted) {
      setLoadState('denied');
      return;
    }

    const assets = await getRecentPhotos();
    const resolved = await Promise.all(
      assets.map(async (asset) => ({ id: asset.id, uri: await resolveDisplayUri(asset) }))
    );
    setPhotos(resolved);
    setLoadState('ready');
  };

  useEffect(() => {
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (finalKept: Photo[], finalDeletedIds: string[]) => {
    if (Platform.OS !== 'web' && finalDeletedIds.length > 0) {
      try {
        await deletePhotos(finalDeletedIds);
      } catch {
        // ユーザーがOSの削除確認をキャンセルした場合などは何もしない
      }
    }
    onDone(finalKept);
  };

  const forceSwipe = (direction: SwipeDirection) => {
    if (index >= photos.length) return;
    const x = direction === 'keep' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => onSwipeComplete(direction));
  };

  const onSwipeComplete = (direction: SwipeDirection) => {
    const photo = photos[index];
    if (!photo) return;
    const nextKept = direction === 'keep' ? [...kept, photo] : kept;
    const nextDeletedIds = direction === 'delete' ? [...deletedAssetIds, photo.id] : deletedAssetIds;
    if (direction === 'keep') {
      setKept(nextKept);
    } else {
      setDeletedAssetIds(nextDeletedIds);
    }
    position.setValue({ x: 0, y: 0 });
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= photos.length) {
      finish(nextKept, nextDeletedIds);
    }
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            forceSwipe('keep');
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            forceSwipe('delete');
          } else {
            resetPosition();
          }
        },
        // 画面遷移直後など、他のジェスチャーに途中で制御を奪われた場合にも
        // カードが指を離した位置で固まらないよう、必ず中央に戻す
        onPanResponderTerminate: () => {
          resetPosition();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, kept, deletedAssetIds]
  );

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
  });

  const keepOpacity = position.x.interpolate({
    inputRange: [10, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const deleteOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -10],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  if (loadState === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.centerText}>写真を読み込み中...</Text>
      </View>
    );
  }

  if (loadState === 'denied') {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>カメラロールへのアクセスが必要です</Text>
        <Text style={styles.centerText}>
          設定アプリで写真へのアクセスを許可してから、もう一度お試しください
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadPhotos}>
          <Text style={styles.retryButtonText}>再試行</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>今週撮影した写真がありません</Text>
      </View>
    );
  }

  if (index >= photos.length) {
    return <View style={styles.container} />;
  }

  const currentPhoto = photos[index];
  const nextPhoto = photos[index + 1];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>今週の写真を整理</Text>
      <Text style={styles.counter}>
        {index + 1} / {photos.length}
      </Text>
      <View style={styles.cardStack}>
        {nextPhoto && (
          <View style={[styles.card, styles.cardBehind]}>
            <Image source={{ uri: nextPhoto.uri }} style={styles.image} />
          </View>
        )}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.card,
            {
              transform: [...position.getTranslateTransform(), { rotate }],
            },
          ]}
        >
          <Image source={{ uri: currentPhoto.uri }} style={styles.image} />
          <Animated.View style={[styles.badge, styles.keepBadge, { opacity: keepOpacity }]}>
            <Text style={styles.badgeText}>KEEP</Text>
          </Animated.View>
          <Animated.View style={[styles.badge, styles.deleteBadge, { opacity: deleteOpacity }]}>
            <Text style={styles.badgeText}>DELETE</Text>
          </Animated.View>
        </Animated.View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => forceSwipe('delete')}
        >
          <Text style={styles.actionText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.keepButton]}
          onPress={() => forceSwipe('keep')}
        >
          <Text style={styles.actionText}>♥</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 20,
  },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  centerTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  centerText: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#333',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  counter: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
    marginBottom: 20,
  },
  cardStack: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  cardBehind: {
    top: 10,
    transform: [{ scale: 0.96 }],
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 30,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 3,
  },
  keepBadge: {
    left: 20,
    borderColor: '#2ecc71',
    transform: [{ rotate: '-15deg' }],
  },
  deleteBadge: {
    right: 20,
    borderColor: '#e74c3c',
    transform: [{ rotate: '15deg' }],
  },
  badgeText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 30,
    gap: 30,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  deleteButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e74c3c',
  },
  keepButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#2ecc71',
  },
  actionText: {
    fontSize: 26,
    fontWeight: '700',
  },
});

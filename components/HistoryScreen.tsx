import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getErrorMessage } from '../lib/errors';
import { getHighlights, Highlight, Visibility } from '../lib/highlights';
import { getHighlightPhotoUrls } from '../lib/photos';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUserId(user?.id ?? null);
        setHighlights(await getHighlights());
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
          <TouchableOpacity
            key={highlight.id}
            style={styles.card}
            onPress={() => toggleExpand(highlight)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.date}>
                {new Date(highlight.createdAt).toLocaleDateString('ja-JP')}
              </Text>
              <Text style={styles.detail}>
                {highlight.photoCount}枚 ・ {VISIBILITY_LABEL[highlight.visibility]}
              </Text>
            </View>

            {expanded && (
              <View style={styles.photoArea}>
                {loadingPhotosId === highlight.id && <ActivityIndicator style={styles.photoLoading} />}
                {(photosByHighlight[highlight.id] ?? []).length === 0 &&
                  loadingPhotosId !== highlight.id && (
                    <Text style={styles.noPhotos}>写真がありません</Text>
                  )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(photosByHighlight[highlight.id] ?? []).map((url, i) => (
                    <Image key={i} source={{ uri: url }} style={styles.photoThumb} />
                  ))}
                </ScrollView>
              </View>
            )}
          </TouchableOpacity>
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
});

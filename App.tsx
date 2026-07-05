import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import AuthScreen from './components/AuthScreen';
import FeedScreen from './components/FeedScreen';
import HistoryScreen from './components/HistoryScreen';
import SelectPhotosScreen from './components/SelectPhotosScreen';
import ShareScreen from './components/ShareScreen';
import SwipeScreen from './components/SwipeScreen';
import { getCurrentSession, signOut, subscribeToAuthChanges } from './lib/auth';
import { ensureWeeklyReminderScheduled, registerPushToken } from './lib/notifications';
import { isSupabaseConfigured } from './lib/supabase';
import type { Photo } from './types';

type Tab = 'organize' | 'feed' | 'history';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [kept, setKept] = useState<Photo[] | null>(null);
  const [photosToPublish, setPhotosToPublish] = useState<Photo[] | null>(null);
  const [tab, setTab] = useState<Tab>('organize');

  const handleSwipeDone = (keptPhotos: Photo[]) => {
    setKept(keptPhotos);
  };

  const handleReset = () => {
    setKept(null);
    setPhotosToPublish(null);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCheckingSession(false);
      return;
    }
    getCurrentSession()
      .then((s) => setSession(s))
      .finally(() => setCheckingSession(false));
    return subscribeToAuthChanges(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    ensureWeeklyReminderScheduled().catch((e) => console.warn('週次リマインダーの予約に失敗しました', e));
    registerPushToken().catch((e) => console.warn('プッシュトークンの登録に失敗しました', e));
  }, [session]);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.center}>
        <StatusBar style="auto" />
        <Text style={styles.configTitle}>Supabase未設定です</Text>
        <Text style={styles.configBody}>
          .env に EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください
        </Text>
      </View>
    );
  }

  if (checkingSession) {
    return (
      <View style={styles.center}>
        <StatusBar style="auto" />
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style="auto" />
        <AuthScreen />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.headerEmail}>{session.user.email}</Text>
        <TouchableOpacity onPress={() => signOut()}>
          <Text style={styles.logout}>ログアウト</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tabBar}>
        <TouchableOpacity onPress={() => setTab('organize')} style={styles.tabButton}>
          <Text style={[styles.tabLabel, tab === 'organize' && styles.tabLabelActive]}>整理</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('feed')} style={styles.tabButton}>
          <Text style={[styles.tabLabel, tab === 'feed' && styles.tabLabelActive]}>フィード</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('history')} style={styles.tabButton}>
          <Text style={[styles.tabLabel, tab === 'history' && styles.tabLabelActive]}>履歴</Text>
        </TouchableOpacity>
      </View>
      {tab === 'feed' ? (
        <FeedScreen />
      ) : tab === 'history' ? (
        <HistoryScreen />
      ) : kept === null ? (
        <SwipeScreen onDone={handleSwipeDone} />
      ) : photosToPublish === null ? (
        <SelectPhotosScreen photos={kept} onConfirm={setPhotosToPublish} />
      ) : (
        <ShareScreen keptPhotos={photosToPublish} onReset={handleReset} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  configTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  configBody: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerEmail: {
    fontSize: 12,
    color: '#999',
  },
  logout: {
    fontSize: 13,
    color: '#e74c3c',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  tabButton: {
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 14,
    color: '#999',
  },
  tabLabelActive: {
    color: '#333',
    fontWeight: '600',
  },
});

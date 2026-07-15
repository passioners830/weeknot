import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import AuthScreen from './components/AuthScreen';
import FeedScreen from './components/FeedScreen';
import HistoryScreen from './components/HistoryScreen';
import SelectPhotosScreen from './components/SelectPhotosScreen';
import ShareScreen from './components/ShareScreen';
import SwipeScreen from './components/SwipeScreen';
import { getCurrentSession, signOut, subscribeToAuthChanges } from './lib/auth';
import { getErrorMessage } from './lib/errors';
import { ensureWeeklyReminderScheduled, registerPushToken } from './lib/notifications';
import { getMyDisplayName, updateDisplayName } from './lib/profile';
import { isSupabaseConfigured } from './lib/supabase';
import type { Photo } from './types';

type Tab = 'organize' | 'feed' | 'history';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [kept, setKept] = useState<Photo[] | null>(null);
  const [photosToPublish, setPhotosToPublish] = useState<Photo[] | null>(null);
  const [tab, setTab] = useState<Tab>('organize');
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const handleSwipeDone = (keptPhotos: Photo[]) => {
    setKept(keptPhotos);
  };

  const openProfileModal = async () => {
    setProfileError(null);
    setProfileModalVisible(true);
    try {
      setDisplayNameDraft(await getMyDisplayName());
    } catch (e) {
      setProfileError(getErrorMessage(e, '表示名の取得に失敗しました'));
    }
  };

  const handleSaveDisplayName = async () => {
    setSavingProfile(true);
    setProfileError(null);
    try {
      await updateDisplayName(displayNameDraft);
      setProfileModalVisible(false);
    } catch (e) {
      setProfileError(getErrorMessage(e, '表示名の更新に失敗しました'));
    } finally {
      setSavingProfile(false);
    }
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
        <TouchableOpacity onPress={openProfileModal}>
          <Text style={styles.headerEmail}>{session.user.email} ・ プロフィール編集</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => signOut()}>
          <Text style={styles.logout}>ログアウト</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={profileModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>表示名を編集</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="表示名"
              value={displayNameDraft}
              onChangeText={setDisplayNameDraft}
              autoFocus
            />
            {profileError && <Text style={styles.modalError}>{profileError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setProfileModalVisible(false)}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveDisplayName} disabled={savingProfile}>
                <Text style={styles.modalSave}>{savingProfile ? '保存中...' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
        <SelectPhotosScreen photos={kept} onConfirm={setPhotosToPublish} onBack={() => setKept(null)} />
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
  modalError: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 8,
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
  modalSave: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
});

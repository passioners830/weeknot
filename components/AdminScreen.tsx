import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getReports, suspendUser, unsuspendUser, Report } from '../lib/admin';
import { getErrorMessage } from '../lib/errors';

export default function AdminScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setReports(await getReports());
    } catch (e) {
      setError(getErrorMessage(e, '通報の取得に失敗しました'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runToggleSuspend = async (report: Report) => {
    setActingOnId(report.authorId);
    setError(null);
    try {
      if (report.authorSuspended) {
        await unsuspendUser(report.authorId);
      } else {
        await suspendUser(report.authorId);
      }
      setReports((prev) =>
        prev.map((r) =>
          r.authorId === report.authorId ? { ...r, authorSuspended: !r.authorSuspended } : r
        )
      );
    } catch (e) {
      setError(getErrorMessage(e, '操作に失敗しました'));
    } finally {
      setActingOnId(null);
    }
  };

  const handleToggleSuspend = (report: Report) => {
    const message = report.authorSuspended
      ? `${report.authorName}さんの利用停止を解除しますか？`
      : `${report.authorName}さんを利用停止にしますか？\nログインを含め、アプリを一切使えなくなります。`;

    if (Platform.OS === 'web') {
      if (window.confirm(message)) runToggleSuspend(report);
      return;
    }

    Alert.alert(
      report.authorSuspended ? '利用停止を解除しますか？' : '利用停止にしますか？',
      report.authorSuspended ? '' : 'ログインを含め、アプリを一切使えなくなります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: report.authorSuspended ? '解除する' : '利用停止にする',
          style: 'destructive',
          onPress: () => runToggleSuspend(report),
        },
      ]
    );
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
      <Text style={styles.title}>通報一覧</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {reports.length === 0 && !error && <Text style={styles.empty}>通報はありません</Text>}

      {reports.map((report) => (
        <View key={report.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.author}>
              {report.authorName}
              {report.authorSuspended && <Text style={styles.suspendedBadge}> ・利用停止中</Text>}
            </Text>
            <Text style={styles.date}>{new Date(report.createdAt).toLocaleDateString('ja-JP')}</Text>
          </View>
          <Text style={styles.reason}>{report.reason}</Text>
          <Text style={styles.reporter}>通報者: {report.reporterName}</Text>

          <TouchableOpacity
            style={[styles.suspendButton, report.authorSuspended && styles.unsuspendButton]}
            onPress={() => handleToggleSuspend(report)}
            disabled={actingOnId === report.authorId}
          >
            {actingOnId === report.authorId ? (
              <ActivityIndicator size="small" color={report.authorSuspended ? '#333' : '#e74c3c'} />
            ) : (
              <Text
                style={[
                  styles.suspendButtonText,
                  report.authorSuspended && styles.unsuspendButtonText,
                ]}
              >
                {report.authorSuspended ? '利用停止を解除' : 'アカウントを利用停止'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ))}
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
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  author: {
    fontSize: 14,
    fontWeight: '600',
  },
  suspendedBadge: {
    fontSize: 12,
    color: '#e74c3c',
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  reason: {
    fontSize: 13,
    color: '#333',
    marginBottom: 6,
  },
  reporter: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
  },
  suspendButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  suspendButtonText: {
    fontSize: 13,
    color: '#e74c3c',
    fontWeight: '600',
  },
  unsuspendButton: {
    borderColor: '#ccc',
  },
  unsuspendButtonText: {
    color: '#333',
  },
});

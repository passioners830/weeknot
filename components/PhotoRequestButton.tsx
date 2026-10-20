import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RequestStatus } from '../lib/photoRequests';

type Props = {
  status: RequestStatus | undefined;
  busy: boolean;
  onPress: () => void;
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'リクエスト済み（返事待ち）',
  accepted: '送ってもらえました（リクエスト画面で保存）',
  declined: '見送られました',
};

export default function PhotoRequestButton({ status, busy, onPress }: Props) {
  if (status) {
    return (
      <View style={[styles.button, styles.done]}>
        <Text style={styles.doneText}>{STATUS_LABEL[status]}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.button} onPress={onPress} disabled={busy} accessibilityLabel="この写真がほしい">
      <Text style={styles.text}>{busy ? '送信中...' : 'この写真がほしい'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    alignSelf: 'center',
  },
  text: { color: '#222', fontSize: 15, fontWeight: '600' },
  done: { backgroundColor: 'rgba(255,255,255,0.18)' },
  doneText: { color: '#fff', fontSize: 13 },
});

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { signIn, signUp } from '../lib/auth';
import { getErrorMessage } from '../lib/errors';

type Mode = 'signIn' | 'signUp';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signUp') {
        await signUp(email, password);
        setMessage('確認メールを送信しました。メール内のリンクから認証してください。');
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(getErrorMessage(e, 'エラーが発生しました'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>{mode === 'signIn' ? 'ログイン' : '新規登録'}</Text>
      <Text style={styles.subtitle}>週間ハイライトを家族・友人と共有しよう</Text>

      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="パスワード"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {message && <Text style={styles.message}>{message}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === 'signIn' ? 'ログイン' : '登録する'}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          setError(null);
          setMessage(null);
        }}
      >
        <Text style={styles.switchText}>
          {mode === 'signIn' ? 'アカウントを作成する' : 'ログイン画面に戻る'}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 6,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  error: {
    color: '#e74c3c',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    color: '#2ecc71',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    backgroundColor: '#333',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    color: '#666',
    fontSize: 13,
    marginTop: 20,
  },
});

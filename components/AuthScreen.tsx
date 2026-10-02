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
import { confirmPasswordReset, requestPasswordReset, signIn, signUp } from '../lib/auth';
import { getErrorMessage } from '../lib/errors';

type Mode = 'signIn' | 'signUp' | 'forgotPassword' | 'resetPassword';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const resetExtraFields = () => {
    setResetToken('');
    setNewPassword('');
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
    if (next === 'signIn') {
      setPassword('');
      resetExtraFields();
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);

    if (mode === 'forgotPassword') {
      if (!email) {
        setError('メールアドレスを入力してください');
        return;
      }
      setLoading(true);
      try {
        await requestPasswordReset(email);
        setMode('resetPassword');
        setMessage('リセット用のコードをメールで送信しました。');
      } catch (e) {
        setError(getErrorMessage(e, 'エラーが発生しました'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'resetPassword') {
      if (!resetToken || !newPassword) {
        setError('コードと新しいパスワードを入力してください');
        return;
      }
      setLoading(true);
      try {
        await confirmPasswordReset(email, resetToken, newPassword);
        switchMode('signIn');
        setMessage('パスワードを変更しました。新しいパスワードでログインしてください。');
      } catch (e) {
        setError(getErrorMessage(e, 'エラーが発生しました'));
      } finally {
        setLoading(false);
      }
      return;
    }

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

  const titles: Record<Mode, string> = {
    signIn: 'ログイン',
    signUp: '新規登録',
    forgotPassword: 'パスワードをリセット',
    resetPassword: '新しいパスワードを設定',
  };

  const buttonLabels: Record<Mode, string> = {
    signIn: 'ログイン',
    signUp: '登録する',
    forgotPassword: 'リセットコードを送信',
    resetPassword: 'パスワードを変更',
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>{titles[mode]}</Text>
      <Text style={styles.subtitle}>週間ハイライトを家族・友人と共有しよう</Text>

      {mode !== 'resetPassword' && (
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
      )}

      {(mode === 'signIn' || mode === 'signUp') && (
        <TextInput
          style={styles.input}
          placeholder="パスワード"
          placeholderTextColor="#999"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      )}

      {mode === 'resetPassword' && (
        <>
          <Text style={styles.resetEmailLabel}>{email} 宛のコードを入力してください</Text>
          <TextInput
            style={styles.input}
            placeholder="メールに記載のコード"
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="number-pad"
            value={resetToken}
            onChangeText={setResetToken}
          />
          <TextInput
            style={styles.input}
            placeholder="新しいパスワード"
            placeholderTextColor="#999"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {message && <Text style={styles.message}>{message}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{buttonLabels[mode]}</Text>}
      </TouchableOpacity>

      {mode === 'signIn' && (
        <TouchableOpacity onPress={() => switchMode('forgotPassword')}>
          <Text style={styles.switchText}>パスワードをお忘れですか？</Text>
        </TouchableOpacity>
      )}

      {(mode === 'signIn' || mode === 'signUp') && (
        <TouchableOpacity onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          <Text style={styles.switchText}>
            {mode === 'signIn' ? 'アカウントを作成する' : 'ログイン画面に戻る'}
          </Text>
        </TouchableOpacity>
      )}

      {(mode === 'forgotPassword' || mode === 'resetPassword') && (
        <TouchableOpacity onPress={() => switchMode('signIn')}>
          <Text style={styles.switchText}>ログイン画面に戻る</Text>
        </TouchableOpacity>
      )}
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
  resetEmailLabel: {
    fontSize: 12,
    color: '#888',
    alignSelf: 'flex-start',
    marginBottom: 8,
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

import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';
import type { TranslationKey } from '../lib/i18n';

export default function LoginScreen(): JSX.Element {
  const { t } = useI18n();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const onSubmit = useCallback(async () => {
    setErrorKey(null);
    try {
      await login(email, password);
      router.replace('/settings');
    } catch (error) {
      setErrorKey(
        error instanceof Error && error.message === 'empty_password'
          ? 'login.passwordRequired'
          : 'login.emailInvalid'
      );
    }
  }, [email, password, login]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>{t('login.title')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('login.email')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t('login.password')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {errorKey !== null ? <Text style={styles.error}>{t(errorKey)}</Text> : null}
      <TouchableOpacity style={styles.button} onPress={() => void onSubmit()}>
        <Text style={styles.buttonText}>{t('login.submit')}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    marginTop: 8,
    paddingVertical: 12
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24
  },
  error: {
    color: '#dc2626',
    marginBottom: 8
  },
  input: {
    borderColor: '#d1d5db',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center'
  }
});

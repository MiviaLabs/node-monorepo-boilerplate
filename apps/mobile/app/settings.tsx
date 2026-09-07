import { useCallback } from 'react';
import type { JSX } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './lib/auth-context';
import { useI18n } from './lib/i18n-context';
import { LOCALES, type Locale } from './lib/i18n';

export default function SettingsScreen(): JSX.Element {
  const { t } = useI18n();
  const { session, logout } = useAuth();

  const onLogout = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [logout]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('settings.title')}</Text>
      <Text style={styles.label}>
        {t('settings.email')}: {session?.email ?? ''}
      </Text>
      <Text style={styles.label}>{t('settings.language')}</Text>
      <View style={styles.localeRow}>
        {LOCALES.map((locale) => (
          <LocaleButton key={locale} locale={locale} />
        ))}
      </View>
      <Pressable style={styles.logout} onPress={() => void onLogout()}>
        <Text style={styles.logoutText}>{t('settings.logout')}</Text>
      </Pressable>
    </View>
  );
}

function LocaleButton({ locale }: { locale: Locale }): JSX.Element {
  const { locale: current, setLocale } = useI18n();
  return (
    <Pressable
      style={[styles.localeButton, current === locale && styles.localeButtonActive]}
      onPress={() => setLocale(locale)}
    >
      <Text style={current === locale ? styles.localeTextActive : styles.localeText}>
        {locale.toUpperCase()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24
  },
  label: {
    fontSize: 16,
    marginBottom: 12
  },
  localeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  localeButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  localeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24
  },
  localeText: {
    color: '#111827'
  },
  localeTextActive: {
    color: '#fff',
    fontWeight: '600'
  },
  logout: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center'
  },
  logoutText: {
    color: '#fff',
    fontWeight: '600'
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24
  }
});

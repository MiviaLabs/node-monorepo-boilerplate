import { useEffect } from 'react';
import type { JSX } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './lib/auth-context';
import { useI18n } from './lib/i18n-context';

export default function IndexScreen(): JSX.Element {
  const { session, ready } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    if (ready) {
      router.replace(session ? '/settings' : '/login');
    }
  }, [ready, session]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('index.title')}</Text>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center'
  },
  title: {
    fontSize: 24,
    fontWeight: '600'
  }
});

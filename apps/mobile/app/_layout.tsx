import type { JSX } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './lib/auth-context';
import { I18nProvider } from './lib/i18n-context';

export default function RootLayout(): JSX.Element {
  return (
    <I18nProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack />
      </AuthProvider>
    </I18nProvider>
  );
}

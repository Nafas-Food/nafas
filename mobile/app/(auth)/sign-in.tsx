import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { signIn } from '../../services/auth';
import { errorCodeOf } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

export default function SignInScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const auth = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    const tel = phone.trim();
    try {
      const response = await signIn(tel, password);
      await auth.setSession(response);
      router.replace('/(tabs)');
    } catch (err) {
      setError(t(`errors.${errorCodeOf(err)}`));
    } finally {
      setLoading(false);
    }
  };

  const isValid = phone.trim().length > 0 && password.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t('signIn.title')}</Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('signIn.phoneLabel')}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder={t('signIn.phonePlaceholder')}
          placeholderTextColor={Colors.mutedForeground}
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('signIn.passwordLabel')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
        />
      </View>

      <Pressable
        style={[styles.primaryButton, (!isValid || loading) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!isValid || loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.primaryForeground} />
        ) : (
          <Text style={styles.primaryButtonText}>{t('signIn.submit')}</Text>
        )}
      </Pressable>

      <Pressable style={styles.registerLink} onPress={() => router.replace('/(auth)/register')}>
        <Text style={styles.registerLinkText}>{t('signIn.createAccountLink')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingVertical: Spacing.s7,
    paddingHorizontal: Spacing.s5,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: FontSize.h1,
    fontWeight: '700',
    color: Colors.foreground,
    marginBottom: Spacing.s6,
  },
  formGroup: {
    marginBottom: Spacing.s4,
  },
  label: {
    fontSize: FontSize.bodySm,
    fontWeight: '600',
    color: Colors.foreground,
    marginBottom: Spacing.s1,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.input,
    paddingVertical: Spacing.s3_5,
    paddingHorizontal: Spacing.s4,
    fontSize: FontSize.body,
    color: Colors.foreground,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.s4,
  },
  primaryButtonText: {
    color: Colors.primaryForeground,
    fontSize: FontSize.bodyLg,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: Colors.destructive,
    fontSize: FontSize.bodySm,
    marginBottom: Spacing.s3,
  },
  registerLink: {
    alignSelf: 'center',
    marginTop: Spacing.s5,
    paddingVertical: Spacing.s2,
  },
  registerLinkText: {
    color: Colors.primary,
    fontSize: FontSize.bodySm,
    fontWeight: '600',
  },
});

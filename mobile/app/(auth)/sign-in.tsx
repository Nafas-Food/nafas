import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { signIn } from '../../services/auth';
import { errorCodeOf } from '../../services/api';
import { Colors, Font, FontSize, Spacing, Radius } from '../../constants/theme';
import { Input } from '../../components/Input';
import { PhoneInput } from '../../components/PhoneInput';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function SignInScreen() {
  const { t, locale, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
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
    } catch (err) {
      setError(t(`errors.${errorCodeOf(err)}`));
    } finally {
      setLoading(false);
    }
  };

  const isValid = phone.trim().length > 0 && password.length > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ backgroundColor: Colors.background }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.inner,
            { paddingTop: insets.top + Spacing.s7 },
          ]}
        >
          <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left', alignSelf: 'stretch' }]}>{t('signIn.title')}</Text>

          {error && <Text style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left', alignSelf: 'stretch' }]}>{error}</Text>}

          <View style={styles.formGroup}>
            <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left', alignSelf: 'stretch' }]}>{t('signIn.phoneLabel')}</Text>
            <PhoneInput
              value={phone}
              onChangeText={setPhone}
              locale={locale}
              isRTL={isRTL}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left', alignSelf: 'stretch' }]}>{t('signIn.passwordLabel')}</Text>
            <Input
              leftIcon="lock"
              showToggle
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              isRTL={isRTL}
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    backgroundColor: Colors.background,
  },
  inner: {
    minHeight: SCREEN_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing.s5,
    paddingBottom: Spacing.s7,
  },
  title: {
    fontSize: FontSize.h1,
    fontFamily: Font.bold,
    color: Colors.foreground,
    marginBottom: Spacing.s6,
  },
  formGroup: {
    marginBottom: Spacing.s4,
  },
  label: {
    fontSize: FontSize.bodySm,
    fontFamily: Font.semibold,
    color: Colors.foreground,
    marginBottom: Spacing.s1,
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
    fontFamily: Font.bold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: Colors.destructive,
    fontSize: FontSize.bodySm,
    fontFamily: Font.regular,
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
    fontFamily: Font.semibold,
  },
});

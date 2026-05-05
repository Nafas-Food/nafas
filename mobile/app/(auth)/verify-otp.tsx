import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { register, sendOtp } from '../../services/auth';
import { errorCodeOf } from '../../services/api';
import { Colors, Font, FontSize, Spacing, Radius } from '../../constants/theme';
import { pendingRegistration } from './register';

const SCREEN_HEIGHT = Dimensions.get('window').height;

function startTimer(
  timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
  setResendTimer: React.Dispatch<React.SetStateAction<number>>,
) {
  if (timerRef.current) clearInterval(timerRef.current);
  setResendTimer(60);
  timerRef.current = setInterval(() => {
    setResendTimer((prev) => {
      if (prev <= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
}

export default function VerifyOtpScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone: routePhone } = useLocalSearchParams<{ phone?: string }>();
  const { setSession } = useAuth();

  const phone = pendingRegistration.phone || routePhone || '';
  const fullName = pendingRegistration.fullName;
  const password = pendingRegistration.password;
  const birthdate = pendingRegistration.birthdate;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(60);
  const [isResending, setIsResending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!phone || !fullName || !password || !birthdate) {
      router.replace('/(auth)/register');
      return;
    }
    startTimer(timerRef, setResendTimer);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleResend = async () => {
    if (isResending) return;
    setIsResending(true);
    try {
      await sendOtp(phone);
      startTimer(timerRef, setResendTimer);
    } catch (err) {
      setError(t(`errors.${errorCodeOf(err)}`));
    } finally {
      setIsResending(false);
    }
  };

  const handleVerify = async () => {
    setError(null);
    setLoading(true);
    try {
      const session = await register({
        fullName,
        phone,
        password,
        birthdate,
        otpCode: code,
      });
      await setSession({
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
    } catch (err) {
      setError(t(`errors.${errorCodeOf(err)}`));
    } finally {
      setLoading(false);
    }
  };

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
          <Text style={styles.title}>{t('verifyOtp.title')}</Text>
          <Text style={styles.subtitle}>{t('verifyOtp.subtitle', { phone })}</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('verifyOtp.codeLabel')}</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
            />
          </View>

          <Pressable
            style={[styles.primaryButton, (code.length < 4 || loading) && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={code.length < 4 || loading}
          >
            {loading ? <ActivityIndicator color={Colors.primaryForeground} /> : (
              <Text style={styles.primaryButtonText}>{t('verifyOtp.submit')}</Text>
            )}
          </Pressable>

          {resendTimer > 0 ? (
            <Text style={styles.timerText}>{t('verifyOtp.resendIn', { seconds: resendTimer })}</Text>
          ) : (
            <Pressable onPress={handleResend} disabled={isResending}>
              <Text style={[styles.resendLink, isResending && styles.buttonDisabled]}>
                {t('verifyOtp.resend')}
              </Text>
            </Pressable>
          )}
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
    marginBottom: Spacing.s2,
  },
  subtitle: {
    fontSize: FontSize.body,
    fontFamily: Font.regular,
    color: Colors.mutedForeground,
    marginBottom: Spacing.s6,
    lineHeight: FontSize.body * 1.5,
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
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.input,
    paddingVertical: Spacing.s3_5,
    paddingHorizontal: Spacing.s4,
    fontSize: FontSize.h2,
    fontFamily: Font.semibold,
    letterSpacing: 8,
    color: Colors.foreground,
    textAlign: 'center',
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
  timerText: {
    color: Colors.mutedForeground,
    fontSize: FontSize.bodySm,
    fontFamily: Font.regular,
    textAlign: 'center',
    marginTop: Spacing.s4,
  },
  resendLink: {
    color: Colors.primary,
    fontSize: FontSize.bodySm,
    fontFamily: Font.semibold,
    textAlign: 'center',
    marginTop: Spacing.s4,
  },
});

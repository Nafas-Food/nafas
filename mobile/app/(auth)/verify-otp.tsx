import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { register, sendOtp } from '../../services/auth';
import { errorCodeOf } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { pendingRegistration } from './register';

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
    try {
      await sendOtp(phone);
      startTimer(timerRef, setResendTimer);
    } catch (err) {
      setError(t(`errors.${errorCodeOf(err)}`));
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
      router.replace('/(tabs)');
    } catch (err) {
      setError(t(`errors.${errorCodeOf(err)}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
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
        <Pressable onPress={handleResend}>
          <Text style={styles.resendLink}>{t('verifyOtp.resend')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.s5,
    paddingTop: Spacing.s7,
  },
  title: {
    fontSize: FontSize.h1,
    fontWeight: '700',
    color: Colors.foreground,
    marginBottom: Spacing.s2,
  },
  subtitle: {
    fontSize: FontSize.body,
    color: Colors.mutedForeground,
    marginBottom: Spacing.s6,
    lineHeight: FontSize.body * 1.5,
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
    fontSize: FontSize.h2,
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
  timerText: {
    color: Colors.mutedForeground,
    fontSize: FontSize.bodySm,
    textAlign: 'center',
    marginTop: Spacing.s4,
  },
  resendLink: {
    color: Colors.primary,
    fontSize: FontSize.bodySm,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.s4,
  },
});
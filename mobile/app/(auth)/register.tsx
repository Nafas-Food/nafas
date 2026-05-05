import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';
import { sendOtp } from '../../services/auth';
import { errorCodeOf } from '../../services/api';
import { Colors, Font, FontSize, Spacing, Radius } from '../../constants/theme';
import { Input } from '../../components/Input';
import { PhoneInput } from '../../components/PhoneInput';

const SCREEN_HEIGHT = Dimensions.get('window').height;

function formatIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const pendingRegistration = { fullName: '', phone: '', password: '', birthdate: '' };

export default function RegisterScreen() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const handleSubmit = async () => {
    if (!birthdate) return;
    // Synchronous guard against double-tap before React re-renders disabled.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    setLoading(true);
    const name = fullName.trim();
    const tel = phone.trim();
    try {
      await sendOtp(tel);
      pendingRegistration.fullName = name;
      pendingRegistration.phone = tel;
      pendingRegistration.password = password;
      pendingRegistration.birthdate = formatIsoDate(birthdate);
      router.push('/(auth)/verify-otp');
    } catch (err) {
      setError(t(`errors.${errorCodeOf(err)}`));
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setPickerOpen(false);
    if (event.type === 'set' && selected) setBirthdate(selected);
  };

  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 120);
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 13);

  const isValid =
    fullName.trim().length >= 2 && phone.trim().length > 0 && password.length >= 8 && birthdate !== null;

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
          <Text style={styles.title}>{t('register.title')}</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.fullNameLabel')}</Text>
            <Input
              leftIcon="user"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.phoneLabel')}</Text>
            <PhoneInput
              value={phone}
              onChangeText={setPhone}
              locale={locale}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.passwordLabel')}</Text>
            <Input
              leftIcon="lock"
              showToggle
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.birthdateLabel')}</Text>
            <Pressable style={styles.dateInput} onPress={() => setPickerOpen(true)}>
              <Text style={birthdate ? styles.dateValue : styles.datePlaceholder}>
                {birthdate ? formatIsoDate(birthdate) : 'YYYY-MM-DD'}
              </Text>
            </Pressable>
            {pickerOpen && (
              <DateTimePicker
                value={birthdate ?? maxDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={minDate}
                maximumDate={maxDate}
                onChange={handleDateChange}
              />
            )}
          </View>

          <Pressable
            style={[styles.primaryButton, (!isValid || loading) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || loading}
          >
            {loading ? <ActivityIndicator color={Colors.primaryForeground} /> : (
              <Text style={styles.primaryButtonText}>{t('register.sendCode')}</Text>
            )}
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
  dateInput: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.input,
    paddingVertical: Spacing.s3_5,
    paddingHorizontal: Spacing.s4,
    fontSize: FontSize.body,
    color: Colors.foreground,
    justifyContent: 'center',
    height: 50,
  },
  dateValue: {
    fontSize: FontSize.body,
    fontFamily: Font.regular,
    color: Colors.foreground,
  },
  datePlaceholder: {
    fontSize: FontSize.body,
    fontFamily: Font.regular,
    color: Colors.sand,
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
});

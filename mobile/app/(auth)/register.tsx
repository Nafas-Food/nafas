import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';
import { sendOtp } from '../../services/auth';
import { errorCodeOf } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

const MIN_BIRTH_YEAR = new Date();
MIN_BIRTH_YEAR.setFullYear(MIN_BIRTH_YEAR.getFullYear() - 120);

const MAX_BIRTH_YEAR = new Date();
MAX_BIRTH_YEAR.setFullYear(MAX_BIRTH_YEAR.getFullYear() - 13);

function formatIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function RegisterScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!birthdate) return;
    setError(null);
    setLoading(true);
    try {
      await sendOtp(phone);
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { phone, fullName, password, birthdate: formatIsoDate(birthdate) },
      });
    } catch (err) {
      setError(t(`errors.${errorCodeOf(err)}`));
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setPickerOpen(false);
    if (event.type === 'set' && selected) setBirthdate(selected);
  };

  const isValid =
    fullName.length >= 2 && phone.length > 0 && password.length >= 8 && birthdate !== null;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t('register.title')}</Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('register.fullNameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('register.phoneLabel')}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+20..."
          placeholderTextColor={Colors.mutedForeground}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('register.passwordLabel')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('register.birthdateLabel')}</Text>
        <Pressable style={styles.input} onPress={() => setPickerOpen(true)}>
          <Text style={birthdate ? styles.dateValue : styles.datePlaceholder}>
            {birthdate ? formatIsoDate(birthdate) : 'YYYY-MM-DD'}
          </Text>
        </Pressable>
        {pickerOpen && (
          <DateTimePicker
            value={birthdate ?? MAX_BIRTH_YEAR}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={MIN_BIRTH_YEAR}
            maximumDate={MAX_BIRTH_YEAR}
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
    justifyContent: 'center',
  },
  dateValue: {
    fontSize: FontSize.body,
    color: Colors.foreground,
  },
  datePlaceholder: {
    fontSize: FontSize.body,
    color: Colors.mutedForeground,
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
});
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, Font, FontSize, Spacing, Radius } from '../constants/theme';
import { CountryPicker, MIDDLE_EAST_COUNTRIES, type Country } from './CountryPicker';

interface PhoneInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (fullNumber: string) => void;
  locale: 'en' | 'ar';
  isRTL?: boolean;
}

const DEFAULT_COUNTRY = MIDDLE_EAST_COUNTRIES[0]; // Egypt +20

function stripLeadingZero(text: string): string {
  return text.startsWith('0') ? text.slice(1) : text;
}

export function PhoneInput({
  value,
  onChangeText,
  locale,
  isRTL,
  placeholder,
  ...textInputProps
}: PhoneInputProps) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localNumber, setLocalNumber] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Sync internal state from external value (initial load, parent reset, country change).
  // Safe against feedback loops: when the user edits, value is set to country.code+localNumber,
  // so the derived state matches what we already have and React bails on the no-op setState.
  useEffect(() => {
    const matchingCountry = MIDDLE_EAST_COUNTRIES.find((c) =>
      value.startsWith(c.code),
    );
    if (matchingCountry) {
      setCountry(matchingCountry);
      setLocalNumber(value.slice(matchingCountry.code.length));
    } else {
      setLocalNumber(stripLeadingZero(value));
    }
  }, [value]);

  const handleLocalChange = (text: string) => {
    const digitsOnly = stripLeadingZero(text.replace(/\D/g, ''));
    setLocalNumber(digitsOnly);
    // Don't emit a prefix-only value (e.g. "+20") when the user has cleared
    // the field — surface an empty string so parent validation treats it as
    // missing rather than a 3-char "valid" phone.
    onChangeText(digitsOnly === '' ? '' : country.code + digitsOnly);
  };

  const handleCountryChange = (newCountry: Country) => {
    setCountry(newCountry);
    onChangeText(localNumber === '' ? '' : newCountry.code + localNumber);
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.container,
          focused ? styles.containerFocused : undefined,
        ]}
      >
        <Pressable
          style={styles.countrySection}
          onPress={() => setShowPicker(true)}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 4 }}
        >
          <TextInput
            style={styles.flag}
            value={country.flag}
            editable={false}
          />
          <TextInput
            style={styles.prefix}
            value={country.code}
            editable={false}
          />
          <Feather
            name="chevron-down"
            size={14}
            color={Colors.sand}
            style={styles.chevron}
          />
        </Pressable>

        <View style={styles.divider} />

        <TextInput
          {...textInputProps}
          ref={inputRef}
          style={[
            styles.input,
            isRTL ? styles.inputRTL : undefined,
            textInputProps.style,
          ]}
          value={localNumber}
          onChangeText={handleLocalChange}
          placeholder={placeholder ?? country.placeholder}
          placeholderTextColor={Colors.sand}
          keyboardType="phone-pad"
          onFocus={(e) => {
            setFocused(true);
            textInputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            textInputProps.onBlur?.(e);
          }}
        />
      </Pressable>

      <CountryPicker
        visible={showPicker}
        selected={country}
        locale={locale}
        onSelect={handleCountryChange}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    zIndex: 1,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.s4,
    height: 50,
  },
  containerFocused: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 4,
    elevation: 2,
  },
  countrySection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s1,
  },
  flag: {
    fontSize: 20,
    padding: 0,
    color: Colors.foreground,
    width: 28,
  },
  prefix: {
    fontSize: FontSize.body,
    fontFamily: Font.semibold,
    color: Colors.foreground,
    padding: 0,
    width: 40,
  },
  chevron: {
    marginLeft: Spacing.s1,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.s3,
  },
  input: {
    flex: 1,
    fontSize: FontSize.body,
    fontFamily: Font.regular,
    color: Colors.foreground,
    paddingVertical: 0,
  },
  inputRTL: {
    textAlign: 'right',
  },
});

import React, { useRef, useState } from 'react';
import {
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, Font, FontSize, Spacing, Radius } from '../constants/theme';
import { useRTL } from '../hooks/useRTL';

interface InputProps extends TextInputProps {
  leftIcon?: keyof typeof Feather.glyphMap;
  showToggle?: boolean;
}

export function Input({
  leftIcon,
  showToggle,
  secureTextEntry,
  ...textInputProps
}: InputProps) {
  const { rowDirection, start, end, textAlign } = useRTL();
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(!secureTextEntry);
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      // Drive flexDirection from useRTL so the leading icon stays on the
      // correct side even when I18nManager.isRTL has not flipped yet (cold
      // launch in Arabic before the LanguageContext-issued reload lands).
      style={[
        styles.container,
        { flexDirection: rowDirection },
        focused ? styles.containerFocused : undefined,
      ]}
    >
      {leftIcon && (
        <Feather
          name={leftIcon}
          size={20}
          color={Colors.sand}
          // Use a side-specific margin instead of `marginEnd` so the gap
          // between icon and text input is correct regardless of the
          // framework's RTL state.
          style={[styles.leadingIcon, { [`margin${end === 'right' ? 'Right' : 'Left'}` as 'marginRight' | 'marginLeft']: Spacing.s2 }]}
        />
      )}
      <TextInput
        {...textInputProps}
        ref={inputRef}
        style={[
          styles.input,
          leftIcon
            ? { [`padding${start === 'left' ? 'Left' : 'Right'}` as 'paddingLeft' | 'paddingRight']: Spacing.s1 }
            : undefined,
          showToggle
            ? { [`padding${end === 'left' ? 'Left' : 'Right'}` as 'paddingLeft' | 'paddingRight']: Spacing.s1 }
            : undefined,
          { textAlign },
          textInputProps.style,
        ]}
        secureTextEntry={showToggle ? !visible : secureTextEntry}
        onFocus={(e) => {
          setFocused(true);
          textInputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          textInputProps.onBlur?.(e);
        }}
        placeholderTextColor={Colors.sand}
      />
      {showToggle && (
        <Pressable
          onPress={() => setVisible((v) => !v)}
          // Same margin trick as the leading icon — use a side-specific key.
          style={[styles.trailingIcon, { [`margin${start === 'left' ? 'Left' : 'Right'}` as 'marginLeft' | 'marginRight']: Spacing.s2 }]}
          hitSlop={8}
        >
          <Feather
            name={visible ? 'eye-off' : 'eye'}
            size={20}
            color={Colors.sand}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
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
  leadingIcon: {},
  input: {
    flex: 1,
    fontSize: FontSize.body,
    fontFamily: Font.regular,
    color: Colors.foreground,
    paddingVertical: 0,
  },
  trailingIcon: {
    padding: Spacing.s1,
  },
});

import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, Font, FontSize, Spacing, Radius } from '../constants/theme';

interface InputProps extends TextInputProps {
  leftIcon?: keyof typeof Feather.glyphMap;
  showToggle?: boolean;
  isRTL?: boolean;
}

export function Input({
  leftIcon,
  showToggle,
  isRTL,
  secureTextEntry,
  ...textInputProps
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(!secureTextEntry);
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={[
        styles.container,
        focused ? styles.containerFocused : undefined,
      ]}
    >
      {leftIcon && (
        <Feather
          name={leftIcon}
          size={20}
          color={Colors.sand}
          style={styles.leftIcon}
        />
      )}
      <TextInput
        {...textInputProps}
        ref={inputRef}
        style={[
          styles.input,
          leftIcon ? styles.inputWithLeftIcon : undefined,
          showToggle ? styles.inputWithRightIcon : undefined,
          isRTL ? styles.inputRTL : undefined,
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
          style={styles.rightIcon}
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
  leftIcon: {
    marginRight: Spacing.s2,
  },
  input: {
    flex: 1,
    fontSize: FontSize.body,
    fontFamily: Font.regular,
    color: Colors.foreground,
    paddingVertical: 0,
  },
  inputWithLeftIcon: {
    paddingLeft: Spacing.s1,
  },
  inputWithRightIcon: {
    paddingRight: Spacing.s1,
  },
  inputRTL: {
    textAlign: 'right',
  },
  rightIcon: {
    marginLeft: Spacing.s2,
    padding: Spacing.s1,
  },
});

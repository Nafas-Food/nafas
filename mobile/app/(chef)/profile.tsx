import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useRTL } from '../../hooks/useRTL';
import { useColors } from '../../hooks/useColors';
import {
  getOwnChefProfile,
  updateChefProfile,
  toggleChefAvailability,
  replaceLogo,
  replaceBanner,
  type UpdateChefProfilePayload,
} from '../../services/chefProfile';
import { errorCodeOf } from '../../services/api';
import type { ChefPrivateProfileResponseDto } from '../../services/chefs';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ChefProfileEditorScreen() {
  const { t } = useLanguage();
  const { textAlign, rowDirection } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { clearSession } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [profile, setProfile] = useState<ChefPrivateProfileResponseDto | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadKind, setUploadKind] = useState<'logo' | 'banner' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [chefName, setChefName] = useState('');
  const [bio, setBio] = useState('');
  const [minOrderPrice, setMinOrderPrice] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Load the chef's existing profile on mount so the form fields show
  // the current values, not blanks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getOwnChefProfile();
        if (cancelled) return;
        setProfile(data);
        setChefName(data.chefName);
        setBio(data.bio);
        setMinOrderPrice(data.minOrderPrice);
        setIsOpen(data.isOpen);
      } catch {
        if (!cancelled) setError(t('errors.NETWORK'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const hasChanges = useMemo(() => {
    if (!profile) return chefName.length > 0 || bio.length > 0 || minOrderPrice.length > 0;
    return (
      chefName !== profile.chefName ||
      bio !== profile.bio ||
      minOrderPrice !== profile.minOrderPrice ||
      isOpen !== profile.isOpen
    );
  }, [profile, chefName, bio, minOrderPrice, isOpen]);

  const onToggleAvailability = useCallback(
    async (next: boolean) => {
      const prev = isOpen;
      setIsOpen(next);
      try {
        const updated = await toggleChefAvailability(next);
        setProfile(updated);
      } catch (err) {
        setIsOpen(prev);
        setError(t('errors.NETWORK'));
      }
    },
    [t, isOpen],
  );

  const onSave = useCallback(async () => {
    Keyboard.dismiss();
    setError(null);
    const payload: UpdateChefProfilePayload = {};
    if (chefName.trim()) payload.chefName = chefName.trim();
    if (bio.trim()) payload.bio = bio.trim();
    if (minOrderPrice.trim()) {
      const val = parseFloat(minOrderPrice.trim());
      if (!isNaN(val) && val > 0) payload.minOrderPrice = val;
    }

    if (Object.keys(payload).length === 0) return;

    setSaving(true);
    try {
      const updated = await updateChefProfile(payload);
      setProfile(updated);
      setChefName(updated.chefName ?? '');
      setBio(updated.bio ?? '');
      setMinOrderPrice(updated.minOrderPrice ?? '');
      setIsOpen(updated.isOpen ?? false);
    } catch {
      setError(t('errors.NETWORK'));
    } finally {
      setSaving(false);
    }
  }, [chefName, bio, minOrderPrice, t]);

  const pickAndUploadImage = async (kind: 'logo' | 'banner') => {
    setError(null);
    setUploadKind(kind);
    try {
      // Dynamic import so the app doesn't crash if expo-image-picker isn't installed yet
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: kind === 'logo' ? [1, 1] : [3, 1],
        quality: 0.9,
      });
      if (result.canceled) {
        setUploadKind(null);
        return;
      }
      const asset = result.assets[0];
      if (!asset) {
        setUploadKind(null);
        return;
      }

      // Client-side validation
      const mimeType = asset.mimeType ?? 'image/jpeg';
      if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
        setError(t('chefProfile.upload.unsupportedType'));
        setUploadKind(null);
        return;
      }
      // Note: expo-image-picker doesn't give file size in all cases.
      // We'll rely on backend validation as defence in depth.

      const uploadFn = kind === 'logo' ? replaceLogo : replaceBanner;
      const updated = await uploadFn(asset.uri, mimeType);
      setProfile(updated);
    } catch (err) {
      const code = errorCodeOf(err);
      if (code === 'UNSUPPORTED_MEDIA_TYPE') {
        setError(t('chefProfile.upload.unsupportedType'));
      } else if (code === 'PAYLOAD_TOO_LARGE') {
        setError(t('chefProfile.upload.tooLarge'));
      } else {
        setError(t('errors.NETWORK'));
      }
    } finally {
      setUploadKind(null);
    }
  };

  const onSignOut = async () => {
    Alert.alert(t('profile.signOut'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.signOut'),
        style: 'destructive',
        onPress: async () => {
          await clearSession();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={[styles.errorText, { textAlign }]}>
          {error ?? t('errors.NETWORK')}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 32,
        }}
      >
        {/* Banner */}
        <Pressable
          onPress={() => pickAndUploadImage('banner')}
          style={styles.bannerWrap}
        >
          <Image source={{ uri: profile.banner }} style={styles.banner} />
          <View style={styles.bannerOverlay}>
            {uploadKind === 'banner' ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Feather name="camera" size={22} color={colors.surface} />
            )}
          </View>
        </Pressable>

        {/* Logo overlapping banner */}
        <Pressable
          onPress={() => pickAndUploadImage('logo')}
          style={styles.logoWrap}
        >
          <Image
            source={{ uri: profile.logo }}
            style={styles.logo}
          />
          <View style={styles.logoOverlay}>
            {uploadKind === 'logo' ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Feather name="camera" size={14} color={colors.surface} />
            )}
          </View>
        </Pressable>

        <View style={styles.content}>
          {/* Availability toggle */}
          <View style={[styles.availabilityRow, { flexDirection: rowDirection }]}>
            <Text style={[styles.availabilityLabel, { textAlign }]}>
              {t('chefProfile.editor.title')}
            </Text>
            <View style={styles.toggleGroup}>
              <Text
                style={[
                  styles.toggleLabel,
                  isOpen && styles.toggleLabelActive,
                ]}
              >
                {t('chefProfile.editor.openToggle')}
              </Text>
              <Switch
                value={isOpen}
                onValueChange={onToggleAvailability}
                trackColor={{
                  false: colors.muted + '40',
                  true: colors.primary + '80',
                }}
                thumbColor={isOpen ? colors.primary : colors.surface}
              />
              <Text
                style={[
                  styles.toggleLabel,
                  !isOpen && styles.toggleLabelActive,
                ]}
              >
                {t('chefProfile.editor.closeToggle')}
              </Text>
            </View>
          </View>

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={[styles.errorText, { textAlign }]}>{error}</Text>
            </View>
          )}

          {/* Chef Name */}
          <View style={styles.field}>
            <Text style={[styles.label, { textAlign }]}>
              {t('chefApply.detailsStep.chefNameLabel')}
            </Text>
            <TextInput
              style={[styles.input, { textAlign }]}
              value={chefName}
              onChangeText={setChefName}
              placeholder={t('chefApply.detailsStep.chefNameLabel')}
              placeholderTextColor={colors.muted}
              maxLength={80}
            />
          </View>

          {/* Bio */}
          <View style={styles.field}>
            <Text style={[styles.label, { textAlign }]}>
              {t('chefApply.detailsStep.bioLabel')}
            </Text>
            <TextInput
              style={[styles.input, styles.textArea, { textAlign }]}
              value={bio}
              onChangeText={setBio}
              placeholder={t('chefApply.detailsStep.bioLabel')}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              maxLength={1000}
            />
          </View>

          {/* Min Order Price */}
          <View style={styles.field}>
            <Text style={[styles.label, { textAlign }]}>
              {t('chefApply.detailsStep.minOrderPriceLabel')}
            </Text>
            <TextInput
              style={[styles.input, { textAlign }]}
              value={minOrderPrice}
              onChangeText={setMinOrderPrice}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Save */}
          <Pressable
            onPress={onSave}
            disabled={saving || !hasChanges}
            style={[
              styles.saveBtn,
              (!hasChanges || saving) && { opacity: 0.6 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.saveBtnText}>
                {t('chefProfile.editor.save')}
              </Text>
            )}
          </Pressable>

          {/* Sign out */}
          <Pressable onPress={onSignOut} style={styles.signOutBtn}>
            <Text style={[styles.signOutText, { textAlign }]}>
              {t('profile.signOut')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    bannerWrap: {
      width: '100%',
      height: 180,
      position: 'relative',
    },
    banner: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    bannerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoWrap: {
      marginTop: -40,
      marginLeft: 20,
      alignSelf: 'flex-start',
      position: 'relative',
    },
    logo: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 4,
      borderColor: colors.surface,
      backgroundColor: colors.background,
    },
    logoOverlay: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    availabilityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      paddingVertical: 8,
    },
    availabilityLabel: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    toggleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    toggleLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.muted,
    },
    toggleLabelActive: {
      color: colors.text,
      fontWeight: '700',
    },
    errorBanner: {
      backgroundColor: colors.danger + '15',
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.danger + '30',
    },
    errorText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.danger,
    },
    field: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    textArea: {
      minHeight: 100,
      paddingTop: 12,
      textAlignVertical: 'top',
    },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    saveBtnText: {
      color: colors.surface,
      fontSize: 16,
      fontWeight: '700',
    },
    signOutBtn: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    signOutText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.danger,
    },
  });
}

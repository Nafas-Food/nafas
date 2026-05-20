import React, { useState, useEffect } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useLanguage } from '../context/LanguageContext';
import { DayOfWeekPicker } from './DayOfWeekPicker';
import { menusService, type ChefMenu, type BilingualText } from '../services/menus';
import { errorCodeOf } from '../services/api';

interface MenuEditorSheetProps {
  visible: boolean;
  categories: { id: string; name: BilingualText }[];
  onClose: () => void;
  onCreated: (menu: ChefMenu) => void;
  editing?: ChefMenu;
  onChanged?: () => void;
}

export function MenuEditorSheet({
  visible,
  categories,
  onClose,
  onCreated,
  editing,
  onChanged,
}: MenuEditorSheetProps) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [mode, setMode] = useState<'specific-days' | 'every-day'>('every-day');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from editing when the sheet opens, or reset for create mode.
  useEffect(() => {
    if (visible) {
      if (editing) {
        setNameEn(editing.name.en);
        setNameAr(editing.name.ar);
        setCategoryId(editing.categoryId);
        setMode(editing.availableAllDays ? 'every-day' : 'specific-days');
        setSelectedDays(editing.availability.map((a) => a.dayOfWeek));
      } else {
        setNameEn('');
        setNameAr('');
        setCategoryId(categories[0]?.id ?? '');
        setMode('every-day');
        setSelectedDays([]);
      }
      setSubmitting(false);
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing]);

  // If categories load/change while open in create mode, reset to first.
  useEffect(() => {
    if (visible && categories.length > 0 && !editing) {
      const stillValid = categories.some((c) => c.id === categoryId);
      if (!categoryId || !stillValid) {
        setCategoryId(categories[0].id);
      }
    }
  }, [visible, categories, categoryId, editing]);

  async function submit() {
    setError(null);
    if (!nameEn.trim() || !nameAr.trim()) {
      setError(t('errors.menu.menu_name_required'));
      return;
    }
    if (!categoryId) {
      setError(t('errors.menu.category_not_found'));
      return;
    }
    if (mode === 'specific-days' && selectedDays.length === 0) {
      setError(t('errors.menu.menu_availability_invalid_weekday'));
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        await menusService.update(editing.id, {
          name: { en: nameEn.trim(), ar: nameAr.trim() },
          categoryId,
          availableAllDays: mode === 'every-day',
        });
        // Sync availability rows. The PATCH endpoint does not accept the day
        // list — backend FR-004 keeps add/remove on dedicated routes. Diff
        // the current rows against the user's selection and fire each delta.
        // (Specific-days mode only; every-day flags the menu as always-on
        // regardless of which rows exist.)
        if (mode === 'specific-days') {
          const currentDays = new Set(editing.availability.map((a) => a.dayOfWeek));
          const targetDays = new Set(selectedDays);
          const toAdd = [...targetDays].filter((d) => !currentDays.has(d));
          const toRemove = [...currentDays].filter((d) => !targetDays.has(d));
          const results = await Promise.allSettled([
            ...toAdd.map((d) => menusService.addAvailability(editing.id, d)),
            ...toRemove.map((d) => menusService.removeAvailability(editing.id, d)),
          ]);
          const failures = results.filter((r) => r.status === 'rejected');
          if (failures.length > 0) {
            const code = errorCodeOf((failures[0] as PromiseRejectedResult).reason);
            setError(t('errors.menu.' + code.toLowerCase()) || code);
            setSubmitting(false);
            return;
          }
        }
        onChanged?.();
      } else {
        const menu = await menusService.create({
          name: { en: nameEn.trim(), ar: nameAr.trim() },
          categoryId,
          availableAllDays: mode === 'every-day',
          initialAvailability: mode === 'specific-days' ? selectedDays : undefined,
        });
        onCreated(menu);
      }
    } catch (err) {
      const code = errorCodeOf(err);
      setError(t('errors.menu.' + code.toLowerCase()) || code);
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDelete() {
    if (!editing) return;
    Alert.alert(
      t('chef.menu.deleteTitle'),
      t('chef.menu.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await menusService.remove(editing.id);
              onChanged?.();
            } catch (err) {
              const code = errorCodeOf(err);
              setError(t('errors.menu.' + code.toLowerCase()) || code);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(31,26,23,0.4)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '90%',
            }}
          >
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 20,
                }}
              >
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>
                  {editing ? t('chef.menu.edit') : t('chef.menu.create')}
                </Text>
                <Pressable onPress={onClose}>
                  <Text style={{ fontSize: 14, color: colors.muted }}>{t('common.cancel')}</Text>
                </Pressable>
              </View>

              {/* Name EN */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.menu.nameEn')}
                </Text>
                <TextInput
                  value={nameEn}
                  onChangeText={setNameEn}
                  placeholder={t('chef.menu.nameEnPlaceholder')}
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: colors.text,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Name AR */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.menu.nameAr')}
                </Text>
                <TextInput
                  value={nameAr}
                  onChangeText={setNameAr}
                  placeholder={t('chef.menu.nameArPlaceholder')}
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: colors.text,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Category */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.menu.category')}
                </Text>
                <View
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  {categories.map((cat) => {
                    const on = categoryId === cat.id;
                    const label = cat.name[isRTL ? 'ar' : 'en'];
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setCategoryId(cat.id)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 999,
                          backgroundColor: on ? colors.primary : colors.surface,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.border,
                        }}
                      >
                        <Text style={{ color: on ? colors.primaryText : colors.text, fontSize: 13 }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Availability mode */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.menu.availability')}
                </Text>
                <View
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    gap: 8,
                  }}
                >
                  {(['every-day', 'specific-days'] as const).map((m) => {
                    const on = mode === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setMode(m)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 12,
                          backgroundColor: on ? colors.primary : colors.surface,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.border,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: on ? colors.primaryText : colors.text, fontSize: 13, fontWeight: '600' }}>
                          {t('chef.menu.mode.' + m)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Day picker (only for specific-days) */}
              {mode === 'specific-days' && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
                    {t('chef.menu.selectDays')}
                  </Text>
                  <DayOfWeekPicker selected={selectedDays} onChange={setSelectedDays} />
                </View>
              )}

              {/* Error */}
              {error && (
                <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                  {error}
                </Text>
              )}

              {/* Submit */}
              <Pressable
                onPress={submit}
                disabled={submitting}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.primaryText, fontSize: 16, fontWeight: '700' }}>
                  {submitting ? t('common.loading') : editing ? t('common.save') : t('common.submit')}
                </Text>
              </Pressable>

              {/* Delete (edit mode only) */}
              {editing && (
                <Pressable
                  onPress={confirmDelete}
                  disabled={submitting}
                  style={{
                    marginTop: 12,
                    paddingVertical: 14,
                    borderRadius: 16,
                    alignItems: 'center',
                    backgroundColor: colors.dangerSurface,
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '700' }}>
                    {t('chef.menu.delete')}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

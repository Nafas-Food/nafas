import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useLanguage } from '../context/LanguageContext';
import { itemsService, type ChefItem, type BilingualText } from '../services/items';
import { errorCodeOf } from '../services/api';

interface ItemEditorSheetProps {
  visible: boolean;
  menuId: string;
  onClose: () => void;
  onCreated: (item: ChefItem) => void;
  editing?: ChefItem;
  onChanged?: () => void;
}

export function ItemEditorSheet({
  visible,
  menuId,
  onClose,
  onCreated,
  editing,
  onChanged,
}: ItemEditorSheetProps) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [priceText, setPriceText] = useState('');
  const [discountValueText, setDiscountValueText] = useState('');
  const [discountUnit, setDiscountUnit] = useState<'fixed' | 'percent'>('fixed');
  const [isUnlimitedStock, setIsUnlimitedStock] = useState(false);
  const [quantityText, setQuantityText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from editing when the sheet opens, or reset for create mode.
  React.useEffect(() => {
    if (visible) {
      if (editing) {
        setNameEn(editing.name.en);
        setNameAr(editing.name.ar);
        setDescriptionEn(editing.description.en);
        setDescriptionAr(editing.description.ar);
        setPriceText(editing.price);
        setDiscountValueText(
          editing.discountValue && editing.discountValue !== '0.00'
            ? editing.discountValue
            : '',
        );
        setDiscountUnit(editing.discountUnit);
        setIsUnlimitedStock(editing.isUnlimitedStock);
        setQuantityText(
          editing.quantity !== undefined ? String(editing.quantity) : '',
        );
      } else {
        setNameEn('');
        setNameAr('');
        setDescriptionEn('');
        setDescriptionAr('');
        setPriceText('');
        setDiscountValueText('');
        setDiscountUnit('fixed');
        setIsUnlimitedStock(false);
        setQuantityText('');
      }
      setSubmitting(false);
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing]);

  async function submit() {
    setError(null);

    if (!nameEn.trim() || !nameAr.trim()) {
      setError(t('errors.item.item_name_required'));
      return;
    }
    if (!descriptionEn.trim() || !descriptionAr.trim()) {
      setError(t('errors.item.item_description_required'));
      return;
    }
    if (!priceText.trim()) {
      setError(t('errors.item.item_price_invalid'));
      return;
    }

    const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;
    if (!DECIMAL_RE.test(priceText.trim())) {
      setError(t('errors.item.item_price_invalid'));
      return;
    }
    const priceVal = parseFloat(priceText.trim());
    if (isNaN(priceVal) || priceVal <= 0) {
      setError(t('errors.item.item_price_invalid'));
      return;
    }

    let discountVal: string | undefined;
    if (discountValueText.trim()) {
      if (!DECIMAL_RE.test(discountValueText.trim())) {
        setError(t('errors.item.item_discount_invalid'));
        return;
      }
      const d = parseFloat(discountValueText.trim());
      if (isNaN(d) || d < 0) {
        setError(t('errors.item.item_discount_invalid'));
        return;
      }
      if (discountUnit === 'fixed' && d > priceVal) {
        setError(t('errors.item.item_negative_effective_price'));
        return;
      }
      if (discountUnit === 'percent' && d > 100) {
        setError(t('errors.item.item_negative_effective_price'));
        return;
      }
      discountVal = discountValueText.trim();
    }

    let stock: { isUnlimitedStock: true } | { isUnlimitedStock: false; quantity: number };
    if (isUnlimitedStock) {
      stock = { isUnlimitedStock: true };
    } else {
      const trimmedQty = quantityText.trim();
      if (!/^\d+$/.test(trimmedQty)) {
        setError(t('errors.item.item_stock_ambiguous'));
        return;
      }
      const q = parseInt(trimmedQty, 10);
      stock = { isUnlimitedStock: false, quantity: q };
    }

    setSubmitting(true);
    try {
      if (editing) {
        await itemsService.update(editing.id, {
          name: { en: nameEn.trim(), ar: nameAr.trim() },
          description: { en: descriptionEn.trim(), ar: descriptionAr.trim() },
          price: priceText.trim(),
          ...(discountVal !== undefined ? { discountValue: discountVal, discountUnit } : {}),
          stock,
        });
        onChanged?.();
      } else {
        const item = await itemsService.create(menuId, {
          name: { en: nameEn.trim(), ar: nameAr.trim() },
          description: { en: descriptionEn.trim(), ar: descriptionAr.trim() },
          price: priceText.trim(),
          ...(discountVal !== undefined ? { discountValue: discountVal, discountUnit } : {}),
          stock,
        });
        onCreated(item);
      }
    } catch (err) {
      const code = errorCodeOf(err);
      setError(t('errors.item.' + code.toLowerCase()) || code);
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDelete() {
    if (!editing) return;
    Alert.alert(
      t('chef.item.deleteTitle'),
      t('chef.item.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await itemsService.remove(editing.id);
              onChanged?.();
            } catch (err) {
              const code = errorCodeOf(err);
              setError(t('errors.item.' + code.toLowerCase()) || code);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.modalBackdrop, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '92%',
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
                  {editing ? t('chef.item.edit') : t('chef.item.create')}
                </Text>
                <Pressable onPress={onClose}>
                  <Text style={{ fontSize: 14, color: colors.muted }}>{t('common.cancel')}</Text>
                </Pressable>
              </View>

              {/* Name EN */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.item.editor.name.en')}
                </Text>
                <TextInput
                  value={nameEn}
                  onChangeText={setNameEn}
                  style={inputStyle(colors, isRTL)}
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Name AR */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.item.editor.name.ar')}
                </Text>
                <TextInput
                  value={nameAr}
                  onChangeText={setNameAr}
                  style={inputStyle(colors, isRTL)}
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Description EN */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.item.editor.description.en')}
                </Text>
                <TextInput
                  value={descriptionEn}
                  onChangeText={setDescriptionEn}
                  multiline
                  numberOfLines={3}
                  style={[inputStyle(colors, isRTL), { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Description AR */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.item.editor.description.ar')}
                </Text>
                <TextInput
                  value={descriptionAr}
                  onChangeText={setDescriptionAr}
                  multiline
                  numberOfLines={3}
                  style={[inputStyle(colors, isRTL), { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Price */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.item.editor.price')}
                </Text>
                <TextInput
                  value={priceText}
                  onChangeText={setPriceText}
                  keyboardType="decimal-pad"
                  style={inputStyle(colors, isRTL)}
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Discount */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  {t('chef.item.editor.discount')}
                </Text>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
                  <TextInput
                    value={discountValueText}
                    onChangeText={setDiscountValueText}
                    keyboardType="decimal-pad"
                    style={[inputStyle(colors, isRTL), { flex: 1 }]}
                    placeholderTextColor={colors.muted}
                  />
                  {(['fixed', 'percent'] as const).map((u) => {
                    const on = discountUnit === u;
                    return (
                      <Pressable
                        key={u}
                        onPress={() => setDiscountUnit(u)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 12,
                          backgroundColor: on ? colors.primary : colors.surface,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: on ? colors.primaryText : colors.text,
                            fontSize: 12,
                            fontWeight: '600',
                          }}
                        >
                          {t('chef.item.editor.discountUnit.' + u)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Stock */}
              <View style={{ marginBottom: 16 }}>
                <View
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                    {t('chef.item.editor.stock.unlimited')}
                  </Text>
                  <Switch
                    value={isUnlimitedStock}
                    onValueChange={setIsUnlimitedStock}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.surface}
                  />
                </View>
                {!isUnlimitedStock && (
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                      {t('chef.item.editor.stock.quantity')}
                    </Text>
                    <TextInput
                      value={quantityText}
                      onChangeText={setQuantityText}
                      keyboardType="number-pad"
                      style={inputStyle(colors, isRTL)}
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                )}
              </View>

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
                    {t('chef.item.delete')}
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

function inputStyle(colors: any, isRTL: boolean) {
  return {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    textAlign: isRTL ? 'right' : 'left' as any,
  };
}

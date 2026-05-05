import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Font, FontSize, Spacing, Radius } from '../constants/theme';

export interface Country {
  code: string;
  nameEn: string;
  nameAr: string;
  flag: string;
  placeholder: string;
}

export const MIDDLE_EAST_COUNTRIES: Country[] = [
  { code: '+20', nameEn: 'Egypt', nameAr: 'مصر', flag: '🇪🇬', placeholder: '011 XXXX XXXX' },
  { code: '+966', nameEn: 'Saudi Arabia', nameAr: 'السعودية', flag: '🇸🇦', placeholder: '05X XXX XXXX' },
  { code: '+971', nameEn: 'UAE', nameAr: 'الإمارات', flag: '🇦🇪', placeholder: '05X XXX XXXX' },
  { code: '+965', nameEn: 'Kuwait', nameAr: 'الكويت', flag: '🇰🇼', placeholder: '5X XXX XXXX' },
  { code: '+974', nameEn: 'Qatar', nameAr: 'قطر', flag: '🇶🇦', placeholder: '3X XXX XXXX' },
  { code: '+973', nameEn: 'Bahrain', nameAr: 'البحرين', flag: '🇧🇭', placeholder: '3X XXX XXXX' },
  { code: '+968', nameEn: 'Oman', nameAr: 'عمان', flag: '🇴🇲', placeholder: '9X XXX XXXX' },
  { code: '+962', nameEn: 'Jordan', nameAr: 'الأردن', flag: '🇯🇴', placeholder: '07X XXX XXXX' },
  { code: '+961', nameEn: 'Lebanon', nameAr: 'لبنان', flag: '🇱🇧', placeholder: '03 XXX XXX' },
  { code: '+964', nameEn: 'Iraq', nameAr: 'العراق', flag: '🇮🇶', placeholder: '07XX XXX XXXX' },
  { code: '+218', nameEn: 'Libya', nameAr: 'ليبيا', flag: '🇱🇾', placeholder: '09X XXX XXXX' },
  { code: '+249', nameEn: 'Sudan', nameAr: 'السودان', flag: '🇸🇩', placeholder: '01X XXX XXXX' },
  { code: '+216', nameEn: 'Tunisia', nameAr: 'تونس', flag: '🇹🇳', placeholder: '2X XXX XXX' },
  { code: '+213', nameEn: 'Algeria', nameAr: 'الجزائر', flag: '🇩🇿', placeholder: '05X XXX XXXX' },
  { code: '+212', nameEn: 'Morocco', nameAr: 'المغرب', flag: '🇲🇦', placeholder: '06X XXX XXXX' },
];

interface CountryPickerProps {
  visible: boolean;
  selected: Country;
  locale: 'en' | 'ar';
  onSelect: (country: Country) => void;
  onClose: () => void;
}

export function CountryPicker({
  visible,
  selected,
  locale,
  onSelect,
  onClose,
}: CountryPickerProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { marginTop: insets.top + Spacing.s8 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {MIDDLE_EAST_COUNTRIES.map((country) => {
              const isSelected = country.code === selected.code;
              return (
                <Pressable
                  key={country.code}
                  style={[
                    styles.item,
                    isSelected && styles.itemSelected,
                  ]}
                  onPress={() => {
                    onSelect(country);
                    onClose();
                  }}
                >
                  <Text style={styles.flag}>{country.flag}</Text>
                  <Text style={styles.name}>
                    {locale === 'ar' ? country.nameAr : country.nameEn}
                  </Text>
                  <Text style={styles.code}>{country.code}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 10, 0, 0.45)',
    paddingHorizontal: Spacing.s5,
  },
  sheet: {
    maxHeight: 380,
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#2C1F14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 4,
    overflow: 'hidden',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: Spacing.s2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.s4,
    paddingVertical: Spacing.s3,
    gap: Spacing.s3,
  },
  itemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  flag: {
    fontSize: 20,
  },
  name: {
    flex: 1,
    fontSize: FontSize.body,
    fontFamily: Font.medium,
    color: Colors.foreground,
  },
  code: {
    fontSize: FontSize.bodySm,
    fontFamily: Font.semibold,
    color: Colors.mutedForeground,
  },
});

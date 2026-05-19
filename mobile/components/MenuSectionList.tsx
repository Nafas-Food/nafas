import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useColors } from '../hooks/useColors';
import { useLanguage } from '../context/LanguageContext';
import { ItemCard } from './ItemCard';
import type { PublicMenuSection } from '../services/chefs';

interface MenuSectionListProps {
  menus: PublicMenuSection[];
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function MenuSectionList({ menus }: MenuSectionListProps) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  // Track which menus the customer has *collapsed*. Default empty set
  // = every section starts expanded so items are immediately visible.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  function toggle(menuId: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuId)) {
        next.delete(menuId);
      } else {
        next.add(menuId);
      }
      return next;
    });
  }

  if (menus.length === 0) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: colors.muted }}>
          {t('customer.profile.menu.empty')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {menus.map((menu) => {
        const isExpanded = !collapsedIds.has(menu.id);
        const menuName = menu.name[isRTL ? 'ar' : 'en'];

        return (
          <View
            key={menu.id}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            {/* Section header */}
            <Pressable
              onPress={() => toggle(menu.id)}
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                {menuName}
              </Text>
              <Text style={{ fontSize: 18, color: colors.muted }}>
                {isExpanded ? '−' : '+'}
              </Text>
            </Pressable>

            {/* Section body */}
            {isExpanded && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                {menu.items.length === 0 ? (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: colors.muted }}>
                      {t('customer.profile.menu.empty')}
                    </Text>
                  </View>
                ) : (
                  menu.items.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

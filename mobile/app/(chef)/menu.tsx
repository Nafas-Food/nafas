import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, Text, Pressable, RefreshControl } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useLanguage } from '../../context/LanguageContext';
import { menusService, type ChefMenu } from '../../services/menus';
import { categoriesService, type Category } from '../../services/categories';
import { MenuEditorSheet } from '../../components/MenuEditorSheet';

export default function ChefMenuScreen() {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const [menus, setMenus] = useState<ChefMenu[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    try {
      const [m, c] = await Promise.all([menusService.listOwn(), categoriesService.list()]);
      setMenus(m);
      setCategories(c);
    } catch {
      // silent fail — user can pull-to-refresh
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 14,
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
          {t('chef.menu.title')}
        </Text>
        <Pressable
          onPress={() => setSheetOpen(true)}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 9,
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '600' }}>
            {t('chef.menu.create')}
          </Text>
        </Pressable>
      </View>

      {/* List or empty state */}
      {menus.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>
            {t('chef.menu.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={menus}
          keyExtractor={(m) => m.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const name = item.name[isRTL ? 'ar' : 'en'];
            const cat = categories.find((c) => c.id === item.categoryId);
            const catName = cat?.name[isRTL ? 'ar' : 'en'] ?? '';
            return (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{name}</Text>
                {catName ? (
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{catName}</Text>
                ) : null}
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', marginTop: 8, gap: 6 }}>
                  <View
                    style={{
                      backgroundColor: colors.primaryLight,
                      borderRadius: 100,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '500' }}>
                      {item.availableAllDays
                        ? t('chef.menu.everyDay')
                        : t('chef.menu.specificDays')}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.primaryLight,
                      borderRadius: 100,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '500' }}>
                      {t('chef.menu.itemCount', { count: item.items?.length ?? 0 })}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <MenuEditorSheet
        visible={sheetOpen}
        categories={categories}
        onClose={() => setSheetOpen(false)}
        onCreated={() => {
          setSheetOpen(false);
          refresh();
        }}
      />
    </View>
  );
}

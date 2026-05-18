import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, Text, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../hooks/useColors';
import { useLanguage } from '../../context/LanguageContext';
import { menusService, type ChefMenu } from '../../services/menus';
import { categoriesService, type Category } from '../../services/categories';
import { MenuEditorSheet } from '../../components/MenuEditorSheet';

export default function ChefMenuScreen() {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [menus, setMenus] = useState<ChefMenu[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    // Fetch menus independently — always set menus even if categories fail
    let m: ChefMenu[] = [];
    try {
      m = await menusService.listOwn();
    } catch {
      // silent fail for menus
    }
    setMenus(m);

    // Fetch categories separately so a categories failure doesn't block menus
    try {
      const c = await categoriesService.list();
      setCategories(c);
    } catch {
      // silent fail for categories — leave previous state or empty
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
      {/* Header — paddingTop accounts for the status bar / notch (mirrors
          the profile-tab pattern with useSafeAreaInsets). */}
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
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

      {/* Always render FlatList so RefreshControl is available even when empty */}
      <FlatList
        data={menus}
        keyExtractor={(m) => m.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 96, // clears the floating ChefGlassTabBar
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>
              {t('chef.menu.empty')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const name = item.name[isRTL ? 'ar' : 'en'];
          const cat = categories.find((c) => c.id === item.categoryId);
          const catName = cat?.name[isRTL ? 'ar' : 'en'] ?? '';
          return (
            <Pressable
              onPress={() => router.push(`/(chef)/menu/${item.id}`)}
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
            </Pressable>
          );
        }}
      />

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

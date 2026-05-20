import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useColors } from '../../hooks/useColors';
import { useLanguage } from '../../context/LanguageContext';
import { menusService, type ChefMenu } from '../../services/menus';
import { categoriesService, type Category } from '../../services/categories';
import { MenuEditorSheet } from '../../components/MenuEditorSheet';
import { errorCodeOf } from '../../services/api';

export default function ChefMenuScreen() {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [menus, setMenus] = useState<ChefMenu[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<ChefMenu | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);
  const [orderedMenus, setOrderedMenus] = useState<ChefMenu[]>([]);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  async function refresh() {
    let m: ChefMenu[] = [];
    try {
      m = await menusService.listOwn();
    } catch {
      // silent
    }
    setMenus(m);
    try {
      const c = await categoriesService.list();
      setCategories(c);
    } catch {
      // silent
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

  function openCreateSheet() {
    setEditingMenu(undefined);
    setSheetOpen(true);
  }

  function openEditSheet(menu: ChefMenu) {
    setEditingMenu(menu);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingMenu(undefined);
  }

  function enterReorderMode() {
    setOrderedMenus([...menus]);
    setReorderMode(true);
    setReorderError(null);
  }

  function cancelReorder() {
    setReorderMode(false);
    setOrderedMenus([]);
    setReorderError(null);
  }

  function moveMenu(index: number, direction: 'up' | 'down') {
    setOrderedMenus((prev) => {
      const next = [...prev];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next;
    });
  }

  async function saveReorder() {
    setReorderSaving(true);
    setReorderError(null);
    try {
      await menusService.reorder(orderedMenus.map((m) => m.id));
      setMenus(orderedMenus);
      setReorderMode(false);
    } catch (err) {
      const code = errorCodeOf(err);
      setReorderError(t('errors.menu.' + code.toLowerCase()) || code);
      await refresh();
      setReorderMode(false);
    } finally {
      setReorderSaving(false);
    }
  }

  const displayMenus = reorderMode ? orderedMenus : menus;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
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
        {reorderMode ? (
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, alignItems: 'center' }}>
            <Pressable
              onPress={cancelReorder}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '600' }}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={saveReorder}
              disabled={reorderSaving}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 9,
                opacity: reorderSaving ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '600' }}>
                {reorderSaving ? t('common.loading') : t('chef.menu.saveOrder')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, alignItems: 'center' }}>
            {menus.length > 1 && (
              <Pressable
                onPress={enterReorderMode}
                style={{
                  padding: 9,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Feather name="list" size={18} color={colors.muted} />
              </Pressable>
            )}
            <Pressable
              onPress={openCreateSheet}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}
            >
              <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '600' }}>
                {t('chef.menu.create')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {reorderError && (
        <Text style={{ color: colors.danger, fontSize: 13, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 8 }}>
          {reorderError}
        </Text>
      )}

      <FlatList
        data={displayMenus}
        keyExtractor={(m) => m.id}
        refreshControl={
          reorderMode ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          )
        }
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 96,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>
              {t('chef.menu.empty')}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const name = item.name[isRTL ? 'ar' : 'en'];
          const cat = categories.find((c) => c.id === item.categoryId);
          const catName = cat?.name[isRTL ? 'ar' : 'en'] ?? '';

          if (reorderMode) {
            return (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Feather name="menu" size={20} color={colors.muted} />
                <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                  {name}
                </Text>
                <View style={{ flexDirection: 'column', gap: 4 }}>
                  <Pressable
                    onPress={() => moveMenu(index, 'up')}
                    disabled={index === 0}
                    style={{ opacity: index === 0 ? 0.3 : 1, padding: 4 }}
                  >
                    <Feather name="chevron-up" size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveMenu(index, 'down')}
                    disabled={index === displayMenus.length - 1}
                    style={{ opacity: index === displayMenus.length - 1 ? 0.3 : 1, padding: 4 }}
                  >
                    <Feather name="chevron-down" size={20} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            );
          }

          return (
            <Pressable
              onLongPress={menus.length > 1 ? enterReorderMode : undefined}
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
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
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
                {/* Edit button */}
                <Pressable
                  onPress={() => openEditSheet(item)}
                  hitSlop={8}
                  style={{ padding: 4, marginLeft: 8 }}
                >
                  <Feather name="edit-2" size={18} color={colors.muted} />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />

      <MenuEditorSheet
        visible={sheetOpen}
        categories={categories}
        editing={editingMenu}
        onClose={closeSheet}
        onCreated={() => {
          closeSheet();
          refresh();
        }}
        onChanged={() => {
          closeSheet();
          refresh();
        }}
      />
    </View>
  );
}

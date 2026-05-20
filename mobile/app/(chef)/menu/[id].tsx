import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useColors } from '../../../hooks/useColors';
import { useLanguage } from '../../../context/LanguageContext';
import { itemsService, type ChefItem } from '../../../services/items';
import { ItemCard } from '../../../components/ItemCard';
import { ItemEditorSheet } from '../../../components/ItemEditorSheet';
import { ItemImagesDialog } from '../../../components/ItemImagesDialog';
import { errorCodeOf } from '../../../services/api';

export default function ChefMenuDetailScreen() {
  const { id: menuId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ChefItem[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChefItem | undefined>(undefined);
  const [imagesItem, setImagesItem] = useState<ChefItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);
  const [orderedItems, setOrderedItems] = useState<ChefItem[]>([]);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await itemsService.listForMenu(menuId);
      setItems(data);
    } catch (err) {
      console.error('Failed to refresh items for menu', menuId, err);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [menuId]);

  useEffect(() => {
    refresh();
  }, [menuId]);

  function openCreateSheet() {
    setEditingItem(undefined);
    setEditorOpen(true);
  }

  function openEditSheet(item: ChefItem) {
    setEditingItem(item);
    setEditorOpen(true);
  }

  function closeSheet() {
    setEditorOpen(false);
    setEditingItem(undefined);
  }

  function enterReorderMode() {
    setOrderedItems([...items]);
    setReorderMode(true);
    setReorderError(null);
  }

  function cancelReorder() {
    setReorderMode(false);
    setOrderedItems([]);
    setReorderError(null);
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    setOrderedItems((prev) => {
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
      await itemsService.reorder(menuId, orderedItems.map((i) => i.id));
      setItems(orderedItems);
      setReorderMode(false);
    } catch (err) {
      const code = errorCodeOf(err);
      setReorderError(t('errors.item.' + code.toLowerCase()) || code);
      await refresh();
      setReorderMode(false);
    } finally {
      setReorderSaving(false);
    }
  }

  const displayItems = reorderMode ? orderedItems : items;

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
        {reorderMode ? (
          <>
            <Pressable onPress={cancelReorder}>
              <Text style={{ color: colors.muted, fontSize: 16, fontWeight: '600' }}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
              {t('chef.menu.reorderItems')}
            </Text>
            <Pressable
              onPress={saveReorder}
              disabled={reorderSaving}
              style={{ opacity: reorderSaving ? 0.6 : 1 }}
            >
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '700' }}>
                {reorderSaving ? t('common.loading') : t('chef.menu.saveOrder')}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={() => router.back()}>
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
                {t('common.back')}
              </Text>
            </Pressable>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
              {t('chef.menu.items')}
            </Text>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, alignItems: 'center' }}>
              {items.length > 1 && (
                <Pressable
                  onPress={enterReorderMode}
                  style={{ padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
                >
                  <Feather name="list" size={16} color={colors.muted} />
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
                  {t('chef.item.create')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {reorderError && (
        <Text style={{ color: colors.danger, fontSize: 13, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 8 }}>
          {reorderError}
        </Text>
      )}

      <FlatList
        data={displayItems}
        keyExtractor={(i) => i.id}
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
              {t('chef.item.empty')}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
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
                  {item.name[isRTL ? 'ar' : 'en']}
                </Text>
                <View style={{ flexDirection: 'column', gap: 4 }}>
                  <Pressable
                    onPress={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    style={{ opacity: index === 0 ? 0.3 : 1, padding: 4 }}
                  >
                    <Feather name="chevron-up" size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveItem(index, 'down')}
                    disabled={index === displayItems.length - 1}
                    style={{ opacity: index === displayItems.length - 1 ? 0.3 : 1, padding: 4 }}
                  >
                    <Feather name="chevron-down" size={20} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            );
          }

          return (
            <View style={{ position: 'relative' }}>
              <Pressable onPress={() => setImagesItem(item)}>
                <ItemCard item={item} />
              </Pressable>
              {/* Action buttons overlay */}
              <View
                style={{
                  position: 'absolute',
                  top: 10,
                  [isRTL ? 'right' : 'left']: 10,
                  flexDirection: 'row',
                  gap: 6,
                }}
              >
                <Pressable
                  onPress={() => openEditSheet(item)}
                  style={{
                    backgroundColor: colors.scrim,
                    borderRadius: 10,
                    padding: 7,
                  }}
                >
                  <Feather name="edit-2" size={14} color={colors.primaryText} />
                </Pressable>
                <Pressable
                  onPress={() => setImagesItem(item)}
                  style={{
                    backgroundColor: colors.scrim,
                    borderRadius: 10,
                    padding: 7,
                  }}
                >
                  <Feather name="image" size={14} color={colors.primaryText} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <ItemEditorSheet
        visible={editorOpen}
        menuId={menuId}
        editing={editingItem}
        onClose={closeSheet}
        onCreated={(newItem) => {
          closeSheet();
          setItems((prev) => [...prev, newItem]);
        }}
        onChanged={() => {
          closeSheet();
          refresh();
        }}
      />

      {imagesItem && (
        <ItemImagesDialog
          item={imagesItem}
          onClose={() => setImagesItem(null)}
          onChanged={(updated) => {
            setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
            setImagesItem(updated);
          }}
        />
      )}
    </View>
  );
}

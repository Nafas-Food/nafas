import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, Pressable, View, Text, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../../hooks/useColors';
import { useLanguage } from '../../../context/LanguageContext';
import { itemsService, type ChefItem } from '../../../services/items';
import { ItemCard } from '../../../components/ItemCard';
import { ItemEditorSheet } from '../../../components/ItemEditorSheet';
import { ItemImagesDialog } from '../../../components/ItemImagesDialog';

export default function ChefMenuDetailScreen() {
  const { id: menuId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ChefItem[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [imagesItem, setImagesItem] = useState<ChefItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
            {t('common.back')}
          </Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
          {t('chef.menu.items')}
        </Text>
        <Pressable
          onPress={() => setEditorOpen(true)}
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

      {/* Items list */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
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
        renderItem={({ item }) => (
          <Pressable onPress={() => setImagesItem(item)}>
            <ItemCard item={item} />
          </Pressable>
        )}
      />

      <ItemEditorSheet
        visible={editorOpen}
        menuId={menuId}
        onClose={() => setEditorOpen(false)}
        onCreated={(newItem) => {
          setEditorOpen(false);
          setItems((prev) => [...prev, newItem]);
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

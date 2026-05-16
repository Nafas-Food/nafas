import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useLanguage } from '../../context/LanguageContext';
import { useRTL } from '../../hooks/useRTL';
import { useColors } from '../../hooks/useColors';
import {
  type ChefCard,
  type DiscoveryQuery,
  discoverChefs,
} from '../../services/chefs';
import { listCategories, type Category } from '../../services/categories';

const DEBOUNCE_MS = 400;
const PAGE_SIZE = 20;

export default function ExploreScreen() {
  const { t, locale } = useLanguage();
  const { textAlign, isRTL } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [chefs, setChefs] = useState<ChefCard[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(q.trim());
      setCursor(0);
      setChefs([]);
      setHasMore(true);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  // Load categories on mount
  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  // Fetch chefs when filters or cursor change
  const fetchChefs = useCallback(
    async (targetCursor: number, append: boolean) => {
      if (targetCursor === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const query: DiscoveryQuery = {
          cursor: targetCursor,
          pageSize: PAGE_SIZE,
        };
        if (selectedCategoryId) query.categoryId = selectedCategoryId;
        if (debouncedQ) query.q = debouncedQ;

        const data = await discoverChefs(query);
        if (append) {
          setChefs((prev) => [...prev, ...data]);
        } else {
          setChefs(data);
        }
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        setError(t('errors.NETWORK'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedCategoryId, debouncedQ, t],
  );

  useEffect(() => {
    setCursor(0);
    setHasMore(true);
    fetchChefs(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId, debouncedQ]);

  const loadMore = useCallback(() => {
    if (inFlightRef.current || loadingMore || !hasMore) return;
    inFlightRef.current = true;
    const nextCursor = cursor + PAGE_SIZE;
    setCursor(nextCursor);
    fetchChefs(nextCursor, true).finally(() => {
      inFlightRef.current = false;
    });
  }, [cursor, fetchChefs, hasMore, loadingMore]);

  const toggleCategory = (id: string) => {
    setSelectedCategoryId((prev) => (prev === id ? null : id));
  };

  const renderChefCard = ({ item }: { item: ChefCard }) => (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/chef/${item.id}`)}
    >
      <View style={styles.bannerWrap}>
        <Image source={{ uri: item.banner }} style={styles.banner} />
        <Image source={{ uri: item.logo }} style={styles.logo} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.chefName} numberOfLines={1}>
            {item.chefName}
          </Text>
          <View
            style={[
              styles.badge,
              {
                  backgroundColor: item.isOpen
                  ? colors.primary + '18'
                  : colors.muted + '18',
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: item.isOpen ? colors.primary : colors.muted },
              ]}
            >
              {item.isOpen
                ? t('discovery.openBadge')
                : t('discovery.closedBadge')}
            </Text>
          </View>
        </View>
        <Text style={styles.bio} numberOfLines={2}>
          {item.bio}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {t('discovery.minOrder', { amount: item.minOrderPrice })}
          </Text>
          {item.distanceKm !== undefined && (
            <Text style={styles.metaText}>
              {t('discovery.distanceFormat', {
                km: item.distanceKm.toFixed(1),
              })}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.screenTitle, { textAlign }]}>
          {t('discovery.tabTitle')}
        </Text>
        <View
          style={[
            styles.searchRow,
            { flexDirection: isRTL ? 'row-reverse' : 'row' },
          ]}
        >
          <Feather
            name="search"
            size={18}
            color={colors.muted}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { textAlign }]}
            placeholder={t('discovery.searchPlaceholder')}
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} style={styles.clearBtn}>
              <Feather name="x-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {categories.map((cat) => {
          const active = selectedCategoryId === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() => toggleCategory(cat.id)}
              style={[
                styles.chip,
                active && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  active && { color: colors.surface },
                ]}
              >
                {cat.name[locale]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && chefs.length === 0 && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { textAlign }]}>{error}</Text>
        </View>
      )}

      {!loading && chefs.length === 0 && !error && (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { textAlign }]}>
            {t('discovery.emptyState')}
          </Text>
        </View>
      )}

      <FlatList
        data={chefs}
        keyExtractor={(item) => item.id}
        renderItem={renderChefCard}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginVertical: 16 }}
            />
          ) : null
        }
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    screenTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
    },
    searchRow: {
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    searchIcon: {
      marginTop: 1,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 0,
    },
    clearBtn: {
      padding: 2,
    },
    chipsScroll: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 100,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginRight: 8,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.muted,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginBottom: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    bannerWrap: {
      position: 'relative',
      height: 140,
    },
    banner: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    logo: {
      position: 'absolute',
      bottom: -20,
      left: 16,
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 3,
      borderColor: colors.surface,
      backgroundColor: colors.background,
    },
    cardBody: {
      paddingHorizontal: 16,
      paddingTop: 28,
      paddingBottom: 16,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6,
    },
    chefName: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 100,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    bio: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
      marginBottom: 8,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 12,
    },
    metaText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.muted,
    },
  });
}

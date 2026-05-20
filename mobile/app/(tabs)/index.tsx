import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useRTL } from '../../hooks/useRTL';
import { useColors, type NafasColors } from '../../hooks/useColors';
import { DeliverToChip } from '../../components/DeliverToChip';
import { homeService, type HomePayload } from '../../services/home';
import type { ChefCard } from '../../services/chefs';
import type { Category } from '../../services/categories';

export default function HomeScreen() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { isRTL, textAlign } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [data, setData] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    homeService
      .get()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Server pre-splits to the first name; fall back to the auth context
  // for the brief moment before the home payload lands.
  const firstName =
    data?.greeting.userFirstName || user?.fullName?.trim().split(/\s+/)[0] || '';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 96 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Delivery chip */}
      <View style={styles.topRow}>
        <DeliverToChip />
        <Pressable
          style={styles.cartBtn}
          onPress={() => router.push('/(tabs)/orders')}
        >
          <Feather name="shopping-bag" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* Greeting */}
      <View style={styles.greetingWrap}>
        <Text style={[styles.greetingLine1, { textAlign }]}>
          {firstName ? t('home.greeting', { name: firstName }) : t('home.greetingGeneric')}
        </Text>
        <Text style={[styles.greetingLine2, { textAlign }]}>
          {t('home.greetingSubtitle')}
        </Text>
      </View>

      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* Open Chefs horizontal scroll */}
      {(data?.openChefs?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.sectionTitle, { textAlign }]}>{t('home.openChefs')}</Text>
            <Pressable onPress={() => router.push('/(tabs)/explore')}>
              <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
            </Pressable>
          </View>
          <FlatList
            horizontal
            data={data!.openChefs}
            keyExtractor={(c) => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chefScroll}
            inverted={isRTL}
            renderItem={({ item }) => (
              <ChefScrollCard chef={item} colors={colors} onPress={() => router.push(`/chef/${item.id}`)} />
            )}
          />
        </View>
      )}

      {/* Category chips */}
      {(data?.categories?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: 20, textAlign }]}>
            {t('home.categories')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.chipsScroll,
              { flexDirection: isRTL ? 'row-reverse' : 'row' },
            ]}
          >
            {data!.categories.map((cat) => (
              <CategoryChip
                key={cat.id}
                cat={cat}
                locale={locale}
                colors={colors}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/explore',
                    params: { categoryId: cat.id },
                  })
                }
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Top-rated grid */}
      {(data?.topRated?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: 20, textAlign }]}>
            {t('home.topRated')}
          </Text>
          <View style={[styles.grid, { paddingHorizontal: 20 }]}>
            {data!.topRated.map((chef) => (
              <Pressable
                key={chef.id}
                style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
                onPress={() => router.push(`/chef/${chef.id}`)}
              >
                <ChefGridCard chef={chef} colors={colors} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function ChefScrollCard({
  chef,
  colors,
  onPress,
}: {
  chef: ChefCard;
  colors: NafasColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 148,
          backgroundColor: colors.surface,
          borderRadius: 14,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: 14,
          marginRight: 12,
          shadowColor: colors.shadow,
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      {/* Logo / avatar */}
      <View style={{ marginBottom: 8, alignSelf: 'flex-start', position: 'relative' }}>
        {chef.logo ? (
          <Image
            source={{ uri: chef.logo }}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.primaryLight,
            }}
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary }}>
              {chef.chefName?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        {/* Open dot */}
        <View
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: 11,
            height: 11,
            borderRadius: 6,
            backgroundColor: chef.isOpen ? colors.successGreen : colors.muted,
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        />
      </View>
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 3 }}>
        {chef.chefName}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Feather name="star" size={11} color={colors.accent} />
        <Text style={{ fontSize: 12, fontWeight: '500', color: colors.text }}>
          {parseFloat(chef.ratings ?? '0').toFixed(1)}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>
          ({chef.totalReviews ?? 0})
        </Text>
      </View>
    </Pressable>
  );
}

function CategoryChip({
  cat,
  locale,
  colors,
  onPress,
}: {
  cat: Category;
  locale: string;
  colors: NafasColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 16,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }}>
        {(cat.name as { en: string; ar: string })[locale as 'en' | 'ar'] ?? cat.name.en}
      </Text>
    </Pressable>
  );
}

function ChefGridCard({ chef, colors }: { chef: ChefCard; colors: NafasColors }) {
  return (
    <View style={{ padding: 12 }}>
      {chef.logo ? (
        <Image
          source={{ uri: chef.logo }}
          style={{
            width: '100%',
            aspectRatio: 1,
            borderRadius: 10,
            backgroundColor: colors.primaryLight,
            marginBottom: 8,
          }}
        />
      ) : (
        <View
          style={{
            width: '100%',
            aspectRatio: 1,
            borderRadius: 10,
            backgroundColor: colors.primaryLight,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary }}>
            {chef.chefName?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}
      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 2 }}>
        {chef.chefName}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Feather name="star" size={10} color={colors.accent} />
        <Text style={{ fontSize: 11, fontWeight: '500', color: colors.text }}>
          {parseFloat(chef.ratings ?? '0').toFixed(1)}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 4,
    },
    cartBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    greetingWrap: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 8,
    },
    greetingLine1: {
      fontSize: 26,
      fontWeight: '400',
      color: colors.text,
      lineHeight: 32,
    },
    greetingLine2: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.primary,
      lineHeight: 32,
    },
    loadingWrap: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    section: {
      marginTop: 24,
    },
    sectionHeader: {
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    seeAll: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.primary,
    },
    chefScroll: {
      paddingHorizontal: 20,
      paddingBottom: 4,
    },
    chipsScroll: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      alignItems: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    gridCard: {
      width: '47%',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    pressed: {
      opacity: 0.88,
    },
  });
}

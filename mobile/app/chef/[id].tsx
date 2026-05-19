import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useLanguage } from '../../context/LanguageContext';
import { useRTL } from '../../hooks/useRTL';
import { useColors } from '../../hooks/useColors';
import {
  getChefPublicProfile,
  type ChefPublicProfileWithMenus,
} from '../../services/chefs';
import { listCategories, type Category } from '../../services/categories';
import { MenuSectionList } from '../../components/MenuSectionList';

export default function ChefPublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useLanguage();
  const { textAlign, isRTL } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [chef, setChef] = useState<ChefPublicProfileWithMenus | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== 'string') {
      setError(t('errors.NOT_FOUND'));
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [profileData, cats] = await Promise.all([
          getChefPublicProfile(id),
          listCategories(),
        ]);
        if (!cancelled) {
          setChef(profileData);
          setCategories(cats);
        }
      } catch {
        if (!cancelled) setError(t('errors.NETWORK'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const categoryNames = useMemo(() => {
    if (!chef) return [];
    return chef.categoryIds
      .map((cid) => {
        const cat = categories.find((c) => c.id === cid);
        return cat ? cat.name[locale] : null;
      })
      .filter(Boolean) as string[];
  }, [chef, categories, locale]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !chef) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { textAlign }]}>
          {error ?? t('errors.NOT_FOUND')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back button */}
      <Pressable
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => router.back()}
      >
        <Feather
          name={isRTL ? 'arrow-right' : 'arrow-left'}
          size={22}
          color={colors.surface}
        />
      </Pressable>

      {/* Banner */}
      <View style={styles.bannerWrap}>
        <Image source={{ uri: chef.banner }} style={styles.banner} />
        <View style={styles.bannerOverlay} />
      </View>

      {/* Logo overlapping banner */}
      <View style={styles.logoWrap}>
        <Image source={{ uri: chef.logo }} style={styles.logo} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Name + badge */}
        <View style={styles.nameRow}>
          <Text style={[styles.chefName, { textAlign }]}>
            {chef.chefName}
          </Text>
          <View
            style={[
              styles.badge,
              {
                  backgroundColor: chef.isOpen
                  ? colors.primary + '18'
                  : colors.muted + '18',
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                  { color: chef.isOpen ? colors.primary : colors.muted },
              ]}
            >
              {chef.isOpen
                ? t('discovery.openBadge')
                : t('discovery.closedBadge')}
            </Text>
          </View>
        </View>

        {/* Rating row */}
        <View style={styles.ratingRow}>
          <Feather name="star" size={14} color={colors.accent} />
          <Text style={styles.ratingText}>
            {chef.totalReviews > 0 ? chef.ratings : '—'}
          </Text>
          {chef.totalReviews > 0 && (
            <Text style={styles.reviewCountText}>
              {t('discovery.reviewCount', { count: chef.totalReviews })}
            </Text>
          )}
        </View>

        {/* Min order */}
        <Text style={[styles.minOrder, { textAlign }]}>
          {t('discovery.minOrder', { amount: chef.minOrderPrice })}
        </Text>

        {/* About */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { textAlign }]}>
            {t('chefPublicProfile.aboutHeader')}
          </Text>
          <Text style={[styles.bio, { textAlign }]}>{chef.bio}</Text>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { textAlign }]}>
            {t('chefPublicProfile.categoriesHeader')}
          </Text>
          {categoryNames.length > 0 ? (
            <View style={styles.chipRow}>
              {categoryNames.map((name) => (
                <View key={name} style={styles.chip}>
                  <Text style={styles.chipText}>{name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyValue, { textAlign }]}>—</Text>
          )}
        </View>

        {/* Menus */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { textAlign }]}>
            {t('chefPublicProfile.menusHeader')}
          </Text>
          <MenuSectionList menus={chef.menus ?? []} />
        </View>

        {/* Reviews */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { textAlign }]}>
            {t('chefPublicProfile.reviewsHeader')}
          </Text>
          <Text style={[styles.emptyValue, { textAlign }]}>
            {t('chefPublicProfile.noReviewsYet')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    emptyText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.muted,
      paddingHorizontal: 32,
    },
    backBtn: {
      position: 'absolute',
      left: 16,
      zIndex: 10,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerWrap: {
      position: 'relative',
      width: '100%',
      height: 200,
    },
    banner: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    bannerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.12)',
    },
    logoWrap: {
      marginTop: -40,
      marginLeft: 20,
      alignSelf: 'flex-start',
    },
    logo: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 4,
      borderColor: colors.surface,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    chefName: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      flexShrink: 1,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 100,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    ratingText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    reviewCountText: {
      fontSize: 13,
      color: colors.muted,
    },
    minOrder: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.muted,
      marginBottom: 20,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    bio: {
      fontSize: 14,
      color: colors.muted,
      lineHeight: 20,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 100,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
    },
    emptyValue: {
      fontSize: 14,
      color: colors.muted,
    },
  });
}

import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useColors } from '../hooks/useColors';
import { useLanguage } from '../context/LanguageContext';
import type { ChefItem } from '../services/items';

interface ItemCardProps {
  item: ChefItem;
  onAddToCart?: () => void;
}

export function ItemCard({ item, onAddToCart }: ItemCardProps) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();

  const name = item.name[isRTL ? 'ar' : 'en'];
  const hasDiscount = item.discountValue !== '0' && item.discountValue !== '';
  const displayPrice = hasDiscount ? item.effectivePrice : item.price;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      {/* Image area */}
      <View style={{ position: 'relative', height: 180 }}>
        {item.images.length > 0 ? (
          <Image
            source={{ uri: item.images[0] }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: colors.primaryLight,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {t('chef.item.noImage')}
            </Text>
          </View>
        )}

        {/* Discount badge */}
        {hasDiscount && (
          <View
            style={{
              position: 'absolute',
              top: 10,
              [isRTL ? 'left' : 'right']: 10,
              backgroundColor: colors.accent,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: colors.primaryText, fontSize: 11, fontWeight: '700' }}>
              {item.discountUnit === 'percent'
                ? t('customer.item.discountBadge', { discount: item.discountValue })
                : `-${item.discountValue} EGP`}
            </Text>
          </View>
        )}

        {/* Out of stock overlay */}
        {!item.inStock && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(31,26,23,0.55)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.primaryText, fontSize: 15, fontWeight: '700' }}>
              {t('customer.item.outOfStock')}
            </Text>
          </View>
        )}
      </View>

      {/* Content area */}
      <View style={{ padding: 14 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
          {name}
        </Text>

        {/* Price row */}
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: onAddToCart ? 10 : 0,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>
            {displayPrice} EGP
          </Text>
          {hasDiscount && (
            <Text
              style={{
                fontSize: 13,
                color: colors.muted,
                textDecorationLine: 'line-through',
              }}
            >
              {item.price} EGP
            </Text>
          )}
        </View>

        {/* Add to cart CTA */}
        {onAddToCart && item.inStock && (
          <Pressable
            onPress={onAddToCart}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '600' }}>
              {t('customer.item.addToCart')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

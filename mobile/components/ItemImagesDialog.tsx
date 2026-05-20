import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '../hooks/useColors';
import { useLanguage } from '../context/LanguageContext';
import { itemsService, type ChefItem } from '../services/items';
import { errorCodeOf } from '../services/api';

interface ItemImagesDialogProps {
  item: ChefItem;
  onClose: () => void;
  onChanged: (updated: ChefItem) => void;
}

function imageKeyFromUrl(publicUrl: string): string {
  const marker = '/storage/v1/object/public/item-images/';
  const i = publicUrl.indexOf(marker);
  if (i === -1) throw new Error('unexpected supabase URL shape');
  return publicUrl.slice(i + marker.length);
}

export function ItemImagesDialog({ item, onClose, onChanged }: ItemImagesDialogProps) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const [images, setImages] = useState<string[]>(item.images);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickAndUpload() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const asset = result.assets[0];
    const file = {
      uri: asset.uri,
      name: asset.fileName ?? 'image.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    };

    setUploading(true);
    try {
      const updated = await itemsService.uploadImage(item.id, file);
      setImages(updated.images);
      onChanged(updated);
    } catch (err) {
      const code = errorCodeOf(err);
      const msg =
        t('errors.item.' + code.toLowerCase()) ||
        (code === 'ITEM_IMAGES_FULL'
          ? t('chef.item.images.full')
          : code === 'UNSUPPORTED_MEDIA_TYPE'
            ? t('errors.item.unsupported_media_type')
            : code === 'PAYLOAD_TOO_LARGE'
              ? t('errors.item.payload_too_large')
              : code === 'ITEM_UPLOAD_RATE_LIMITED'
                ? t('errors.item.item_upload_rate_limited')
                : code);
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  function confirmRemoveImage(uri: string) {
    Alert.alert(
      t('chef.item.images.removeTitle'),
      t('chef.item.images.removeConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setUploading(true);
            try {
              const imageKey = imageKeyFromUrl(uri);
              const updated = await itemsService.removeImage(item.id, imageKey);
              setImages(updated.images);
              onChanged(updated);
            } catch (err) {
              const code = errorCodeOf(err);
              setError(t('errors.item.' + code.toLowerCase()) || code);
            } finally {
              setUploading(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(31,26,23,0.5)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '80%',
            padding: 20,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {t('chef.item.images.title')}
            </Text>
            <Pressable onPress={onClose}>
              <Text style={{ fontSize: 14, color: colors.muted }}>{t('common.done')}</Text>
            </Pressable>
          </View>

          {/* Image carousel */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
          >
            {images.map((uri, index) => (
              <View key={`${uri}-${index}`} style={{ position: 'relative' }}>
                <Image
                  source={{ uri }}
                  style={{ width: 140, height: 140, borderRadius: 14 }}
                  resizeMode="cover"
                />
                {/* Per-image remove button */}
                <Pressable
                  onPress={() => confirmRemoveImage(uri)}
                  disabled={uploading}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    backgroundColor: colors.scrimStrong,
                    borderRadius: 14,
                    width: 28,
                    height: 28,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: uploading ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '700', lineHeight: 16 }}>
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
            {/* Add image placeholder */}
            <Pressable
              onPress={pickAndUpload}
              disabled={uploading || images.length >= 5}
              style={{
                width: 140,
                height: 140,
                borderRadius: 14,
                backgroundColor: colors.primaryLight,
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: colors.primary,
                justifyContent: 'center',
                alignItems: 'center',
                opacity: uploading || images.length >= 5 ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 28, color: colors.primary }}>+</Text>
              <Text style={{ fontSize: 12, color: colors.primary, marginTop: 4 }}>
                {t('chef.item.images.add')}
              </Text>
            </Pressable>
          </ScrollView>

          {/* Error */}
          {error && (
            <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
              {error}
            </Text>
          )}

          {/* Info */}
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>
            {t('chef.item.images.limit', { count: images.length })}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

import { View, Text } from 'react-native';
import { useLanguage } from '../../context/LanguageContext';

export default function ChefPlaceholder() {
  const { t } = useLanguage();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{t('home.chefPlaceholder')}</Text>
    </View>
  );
}

import mobileAds from 'react-native-google-mobile-ads';

export async function initializeAds(): Promise<void> {
  await mobileAds().initialize();
}

import { Platform } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

// AdMobで発行したバナー広告ユニットID（Android/iOSそれぞれ別のIDが発行される）
const BANNER_UNIT_ID = Platform.select({
  android: 'ca-app-pub-7963050408481805/8399229107',
  ios: 'ca-app-pub-7963050408481805/9320594382',
})!;

// react-native-google-mobile-adsはWebに対応していないため、
// Web版ではこのファイルの代わりにAdBanner.web.tsx（何もレンダリングしないスタブ）が使われる
export default function AdBanner() {
  return (
    <BannerAd
      unitId={BANNER_UNIT_ID}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );
}

// react-native-google-mobile-adsはWebに対応しておらず、importするだけで
// Webのバンドルが壊れるため、Web版ではこのファイル（ネイティブ側への依存が一切無いもの）に差し替える
export async function initializeAds(): Promise<void> {
  // Webでは広告SDKを初期化しない
}

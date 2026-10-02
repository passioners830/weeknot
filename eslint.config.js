const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    // Denoランタイム用のEdge Function（リモートURL importやDenoグローバルを使う）は
    // このReact Nativeプロジェクトのlint/型チェック対象外
    ignores: ['supabase/functions/**'],
  },
  {
    rules: {
      // Animated.ValueXY を useRef で保持し、interpolate/getTranslateTransform を
      // レンダー中に呼ぶのはReact Nativeの標準的なアニメーションパターンのため無効化
      'react-hooks/refs': 'off',
      // 初回マウント時にデータ取得してsetStateする一般的なパターンのため無効化
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

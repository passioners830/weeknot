import { ReactNode, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { neighborTab, swipeDirection } from '../lib/tabNavigation';

type Props<T> = {
  order: readonly T[];
  current: T;
  onChange: (next: T) => void;
  enabled?: boolean;
  children: ReactNode;
};

// 子の横スクロール（写真の一覧など）は、そこから触り始めた場合はスクロールが優先される
export default function SwipeableTabs<T>({ order, current, onChange, enabled = true, children }: Props<T>) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-40, 40])
        .failOffsetY([-25, 25])
        .onEnd((e, success) => {
          if (!success) return;
          const direction = swipeDirection(e.translationX, e.velocityX);
          if (direction === 0) return;
          const next = neighborTab(order, current, direction);
          if (next !== current) onChange(next);
        }),
    [order, current, onChange, enabled]
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.content}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
});

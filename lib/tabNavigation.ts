export const TAB_SWIPE_DISTANCE = 60;
export const TAB_SWIPE_VELOCITY = 800;

// 左にスワイプ（translationXが負）で次のタブ(+1)、右にスワイプで前のタブ(-1)。
// 距離が足りなくても、勢いのあるフリックなら切り替える
export function swipeDirection(translationX: number, velocityX: number): 1 | -1 | 0 {
  if (translationX <= -TAB_SWIPE_DISTANCE || velocityX <= -TAB_SWIPE_VELOCITY) return 1;
  if (translationX >= TAB_SWIPE_DISTANCE || velocityX >= TAB_SWIPE_VELOCITY) return -1;
  return 0;
}

export function neighborTab<T>(order: readonly T[], current: T, direction: 1 | -1): T {
  const index = order.indexOf(current);
  if (index === -1) return current;
  return order[index + direction] ?? current;
}

import { TAB_SWIPE_DISTANCE, TAB_SWIPE_VELOCITY, neighborTab, swipeDirection } from '../tabNavigation';

describe('swipeDirection', () => {
  it('moves to the next tab on a long left swipe and the previous tab on a long right swipe', () => {
    expect(swipeDirection(-TAB_SWIPE_DISTANCE, 0)).toBe(1);
    expect(swipeDirection(TAB_SWIPE_DISTANCE, 0)).toBe(-1);
  });

  it('ignores short, slow swipes', () => {
    expect(swipeDirection(-(TAB_SWIPE_DISTANCE - 1), -(TAB_SWIPE_VELOCITY - 1))).toBe(0);
    expect(swipeDirection(TAB_SWIPE_DISTANCE - 1, TAB_SWIPE_VELOCITY - 1)).toBe(0);
    expect(swipeDirection(0, 0)).toBe(0);
  });

  it('accepts a short but fast flick', () => {
    expect(swipeDirection(-20, -TAB_SWIPE_VELOCITY)).toBe(1);
    expect(swipeDirection(20, TAB_SWIPE_VELOCITY)).toBe(-1);
  });
});

describe('neighborTab', () => {
  const order = ['organize', 'sorted', 'feed', 'history'] as const;

  it('returns the adjacent tab in either direction', () => {
    expect(neighborTab(order, 'sorted', 1)).toBe('feed');
    expect(neighborTab(order, 'sorted', -1)).toBe('organize');
  });

  it('stays on the first and last tab instead of wrapping around', () => {
    expect(neighborTab(order, 'organize', -1)).toBe('organize');
    expect(neighborTab(order, 'history', 1)).toBe('history');
  });

  it('stays put when the current tab is not in the order', () => {
    expect(neighborTab<string>(order, 'admin', 1)).toBe('admin');
  });
});

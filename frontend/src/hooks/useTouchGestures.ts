import React, { useCallback, useRef } from 'react';

interface TouchGestureOptions {
  onPinchZoom?: (scaleDelta: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onSwipeDown?: () => void;
  longPressDelay?: number;
  swipeThreshold?: number;
}

interface TouchState {
  initialDistance: number;
  initialScale: number;
}

function getDistance(t1: React.Touch, t2: React.Touch): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function useTouchGestures(options: TouchGestureOptions) {
  const {
    onPinchZoom,
    onLongPress,
    onSwipeDown,
    longPressDelay = 500,
    swipeThreshold = 80,
  } = options;

  const pinchState = useRef<TouchState | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Pinch detection (2 fingers)
      if (e.touches.length === 2 && onPinchZoom) {
        const dist = getDistance(e.touches[0], e.touches[1]);
        pinchState.current = { initialDistance: dist, initialScale: 1 };
        clearLongPress();
        return;
      }

      // Single touch: long-press + swipe tracking
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };

        if (onLongPress) {
          clearLongPress();
          longPressTimer.current = setTimeout(() => {
            onLongPress(touch.clientX, touch.clientY);
            longPressTimer.current = null;
          }, longPressDelay);
        }
      }
    },
    [onPinchZoom, onLongPress, longPressDelay, clearLongPress],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // Pinch zoom
      if (e.touches.length === 2 && pinchState.current && onPinchZoom) {
        const dist = getDistance(e.touches[0], e.touches[1]);
        const scaleDelta = dist / pinchState.current.initialDistance;
        onPinchZoom(scaleDelta);
        return;
      }

      // Cancel long-press on movement
      if (e.touches.length === 1 && touchStartPos.current) {
        const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
        const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
        if (dx > 10 || dy > 10) {
          clearLongPress();
        }
      }
    },
    [onPinchZoom, clearLongPress],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      clearLongPress();

      // Swipe-down detection
      if (onSwipeDown && touchStartPos.current && e.changedTouches.length === 1) {
        const endY = e.changedTouches[0].clientY;
        const delta = endY - touchStartPos.current.y;
        if (delta > swipeThreshold) {
          onSwipeDown();
        }
      }

      pinchState.current = null;
      touchStartPos.current = null;
    },
    [onSwipeDown, swipeThreshold, clearLongPress],
  );

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

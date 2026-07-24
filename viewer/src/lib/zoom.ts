export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomStep(current: number, direction: 1 | -1): number {
  return clampZoom(current + direction * ZOOM_STEP);
}

/** Ctrl+ホイール操作からの次のズーム値を計算する。
 * deltaYが負（ホイールを奥へ回す）で拡大、正（手前へ回す）で縮小する。 */
export function zoomFromWheelDelta(current: number, deltaY: number): number {
  const direction = deltaY < 0 ? 1 : -1;
  return zoomStep(current, direction);
}

export interface Point {
  x: number;
  y: number;
}

/**
 * カーソル（pointer）位置を中心に拡大縮小しても、その位置に写っている
 * 写真上の点が画面上で動かないよう、新しいpan（表示位置のずらし量）を計算する。
 * center はコンテナ自体の中心座標（= pan=0の時の画像の中心）。
 */
export function zoomToPoint(
  pan: Point,
  currentZoom: number,
  nextZoom: number,
  pointer: Point,
  center: Point
): Point {
  const ratio = nextZoom / currentZoom;
  return {
    x: pointer.x - center.x - ratio * (pointer.x - center.x - pan.x),
    y: pointer.y - center.y - ratio * (pointer.y - center.y - pan.y),
  };
}

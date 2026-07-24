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

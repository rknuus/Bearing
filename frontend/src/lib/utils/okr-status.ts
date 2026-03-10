/**
 * Derives a goal status label from a progress percentage.
 *
 * @param progress - Rollup progress (0–100), or negative when no tracked KRs exist.
 */
export function getObjectiveStatus(progress: number): 'on-track' | 'needs-attention' | 'off-track' | 'no-status' {
  if (progress < 0) return 'no-status';
  if (progress >= 66) return 'on-track';
  if (progress >= 33) return 'needs-attention';
  return 'off-track';
}

// 아기의 밥상 — 이유식 도메인 공용 상수/유틸 (클라이언트·서버 공용, 순수 함수만)

// ── 이유식 단계 ──────────────────────────────────────────────
export type Stage = 'early' | 'mid' | 'late' | 'finish';
export const STAGE_LABELS: Record<Stage, string> = {
  early: '초기', mid: '중기', late: '후기', finish: '완료기',
};
export const STAGE_ICONS: Record<Stage, string> = {
  early: '🥣', mid: '🍚', late: '🍲', finish: '🍱',
};
// 단계별 월령 안내(권장 범위)
export const STAGE_MONTHS: Record<Stage, string> = {
  early: '4~6개월', mid: '7~9개월', late: '10~12개월', finish: '12~18개월',
};
export const STAGE_ORDER: Stage[] = ['early', 'mid', 'late', 'finish'];

/** 월령만으로 기본 이유식 단계 추정 (발달체크로 보정 전 기본값) */
export function stageByMonths(months: number): Stage {
  if (months <= 6) return 'early';
  if (months <= 9) return 'mid';
  if (months <= 12) return 'late';
  return 'finish';
}

// ── 냉장고 재고 ─────────────────────────────────────────────
export type PantryKind = 'ingredient' | 'cube' | 'prepared';
export const KIND_LABELS: Record<PantryKind, string> = {
  ingredient: '원재료', cube: '냉동 큐브', prepared: '냉장 이유식',
};
export type Storage = 'room' | 'fridge' | 'freezer';
export const STORAGE_LABELS: Record<Storage, string> = {
  room: '실온', fridge: '냉장', freezer: '냉동',
};

// ── 섭취 비율 ───────────────────────────────────────────────
export type IntakeRatio = 'all' | 'half' | 'little' | 'refused';
export const INTAKE_LABELS: Record<IntakeRatio, string> = {
  all: '전량', half: '절반', little: '조금', refused: '거부',
};
export const INTAKE_FACTOR: Record<IntakeRatio, number> = {
  all: 1, half: 0.5, little: 0.25, refused: 0,
};

// ── 날짜 유틸 ───────────────────────────────────────────────
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 만 개월수 계산 (자매앱 getAgeInfo와 동일 규칙) */
export function getAgeMonths(birthStr: string): number {
  const [y, m, d] = birthStr.split('-').map(Number);
  const birth = new Date(y, m - 1, d), now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months--;
  return months < 0 ? 0 : months;
}

/** 소진기한까지 남은 일수 (오늘=0, 지남=음수) */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target - now.getTime()) / 86400000);
}

/** D-day 배지 상태: 여유(safe)/임박(soon,≤2일)/경과(expired) */
export function expiryStatus(dateStr: string | null | undefined): 'none' | 'safe' | 'soon' | 'expired' {
  const d = daysUntil(dateStr);
  if (d === null) return 'none';
  if (d < 0) return 'expired';
  if (d <= 2) return 'soon';
  return 'safe';
}

export function ddayLabel(dateStr: string | null | undefined): string {
  const d = daysUntil(dateStr);
  if (d === null) return '';
  if (d === 0) return 'D-day';
  return d > 0 ? `D-${d}` : `D+${-d}`;
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

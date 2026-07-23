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
  ingredient: '원재료', cube: '냉동 큐브', prepared: '보관 이유식',
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

// ── 재료 이모지 ─────────────────────────────────────────────
const EMOJI: Record<string, string> = {
  쌀: '🍚', 찹쌀: '🍚', 오트밀: '🥣', 감자: '🥔', 고구마: '🍠', 애호박: '🥒',
  브로콜리: '🥦', 당근: '🥕', 청경채: '🥬', 시금치: '🥬', 양배추: '🥬',
  소고기: '🥩', 닭고기: '🍗', 달걀노른자: '🥚', 흰살생선: '🐟', 두부: '⬜',
  사과: '🍎', 배: '🍐', 바나나: '🍌', 꿀: '🍯', 생우유: '🥛',
};
export function ingredientEmoji(name: string): string {
  for (const k of Object.keys(EMOJI)) if (name.includes(k)) return EMOJI[k];
  return '🥣';
}

// ── 식품군 ──────────────────────────────────────────────────
export type FoodGroup = '곡류' | '채소' | '과일' | '단백질' | '유제품';
export const FOOD_GROUPS: FoodGroup[] = ['곡류', '채소', '과일', '단백질', '유제품'];
export const GROUP_COLORS: Record<FoodGroup, string> = {
  곡류: 'var(--orange-400)', 채소: 'var(--green-400)', 과일: 'var(--pink-400)', 단백질: 'var(--blue-400)', 유제품: 'var(--orange-200)',
};
const CATEGORY_TO_GROUP: Record<string, FoodGroup> = {
  곡류: '곡류', 채소: '채소', 과일: '과일', 육류: '단백질', 어류: '단백질', 난류: '단백질', 콩류: '단백질', 유제품: '유제품',
};
// 재료명 키워드 → 식품군 (사전에 없는 이름도 분류되도록). 순서대로 첫 매칭.
// 순서 주의: 채소를 과일보다 먼저 검사(양배추·감자 등이 과일 "배"·"감"에 오분류되지 않도록)
const GROUP_KEYWORDS: [FoodGroup, RegExp][] = [
  ['곡류', /쌀|찹쌀|현미|백미|잡곡|보리|오트|귀리|퀴노아|수수|밥|죽|미음|국수|빵|시리얼|전분|밀가루/],
  ['단백질', /소고기|쇠고기|한우|닭|계육|돼지|고기|안심|사태|달걀|계란|노른자|흰자|메추리|생선|대구|가자미|연어|광어|흰살|명태|두부|순두부|콩|완두|병아리콩|렌틸|새우|멸치|들깨|검은깨/],
  ['유제품', /우유|치즈|요거트|요구르트|분유|모유|버터|생크림|플레인/],
  ['채소', /애호박|호박|양배추|배추|브로콜리|콜리플라워|당근|시금치|청경채|양파|대파|무|비트|오이|파프리카|피망|버섯|표고|느타리|아욱|근대|비타민|케일|감자|고구마|단호박|가지|콩나물|숙주|연근|우엉|아스파라거스|셀러리|부추|나물/],
  ['과일', /사과|배|바나나|블루베리|딸기|아보카도|망고|복숭아|자두|귤|오렌지|참외|수박|포도|키위|토마토|곶감|단감|홍시/],
];

/** 재료명 → 식품군 (물·기타·미분류는 null = 비율에서 제외) */
export function ingredientGroup(name: string, category?: string | null): FoodGroup | null {
  if (!name) return null;
  if (/물|육수|다시|간|소금|참기름|들기름|올리브|식용유|설탕|꿀/.test(name)) return null;
  if (category && CATEGORY_TO_GROUP[category]) return CATEGORY_TO_GROUP[category];
  for (const [g, re] of GROUP_KEYWORDS) if (re.test(name)) return g;
  return null;
}

export interface CompItem { name: string; amountG: number; group?: FoodGroup | null }

/** 배치 구성 + 먹은g/총g → 식품군별 섭취 g (물·기타 제외) */
export function groupBreakdown(comp: CompItem[], eatenG: number | null, totalG: number | null): Record<FoodGroup, number> {
  const out = { 곡류: 0, 채소: 0, 과일: 0, 단백질: 0, 유제품: 0 } as Record<FoodGroup, number>;
  const frac = eatenG != null && totalG ? eatenG / totalG : 1;
  for (const it of comp) {
    const g = it.group ?? ingredientGroup(it.name);
    if (g) out[g] += (it.amountG || 0) * frac;
  }
  return out;
}

/** 두 날짜 사이 개월수(소수) — 측정일 기준 아기 월령 계산용 */
export function monthsBetween(birthStr: string, dateStr: string): number {
  const [by, bm, bd] = birthStr.split('-').map(Number);
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  let months = (dy - by) * 12 + (dm - bm);
  if (dd < bd) months -= 1;
  const frac = (dd - bd) / 30;
  return Math.max(0, months + (dd >= bd ? frac : 1 + frac));
}

/** 이유식 단계 진행률(현재 단계 안에서의 %, 0~100) */
export function stageProgress(months: number): number {
  const ranges: Record<Stage, [number, number]> = { early: [4, 7], mid: [7, 10], late: [10, 13], finish: [13, 19] };
  const [s, e] = ranges[stageByMonths(months)];
  return Math.max(0, Math.min(100, Math.round(((months - s) / (e - s)) * 100)));
}

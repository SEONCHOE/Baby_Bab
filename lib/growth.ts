// WHO Growth Standards 백분위 (0~24개월) — 자매앱과 동일 데이터
// P3/P50/P97 을 z 앵커(-1.881 / 0 / +1.881)로 삼아 측정값의 백분위를 추정한다.
export const GROWTH_DATA = {
  boy: {
    height: { P3: [46.1, 50.2, 53.2, 55.3, 57.0, 58.4, 59.7, 60.9, 62.1, 63.3, 64.5, 65.6, 66.7, 67.7, 68.7, 69.7, 70.6, 71.5, 72.4, 73.3, 74.2, 75.1, 75.9, 76.8, 77.7], P50: [49.9, 54.7, 58.4, 61.4, 63.9, 65.9, 67.6, 69.2, 70.6, 72.0, 73.3, 74.5, 75.7, 76.9, 78.0, 79.1, 80.2, 81.2, 82.3, 83.2, 84.2, 85.1, 86.0, 86.9, 87.8], P97: [53.4, 59.0, 63.2, 66.8, 69.4, 71.9, 74.0, 75.9, 77.7, 79.3, 80.9, 82.4, 83.8, 85.1, 86.4, 87.7, 88.9, 90.1, 91.3, 92.5, 93.7, 94.9, 96.0, 97.2, 98.3] },
    weight: { P3: [2.5, 3.4, 4.4, 5.1, 5.6, 6.1, 6.4, 6.7, 7.0, 7.2, 7.4, 7.6, 7.8, 8.0, 8.2, 8.4, 8.6, 8.7, 8.9, 9.1, 9.2, 9.4, 9.5, 9.7, 9.8], P50: [3.3, 4.5, 5.6, 6.4, 7.0, 7.5, 7.9, 8.3, 8.6, 8.9, 9.2, 9.4, 9.6, 9.9, 10.1, 10.3, 10.5, 10.7, 10.9, 11.1, 11.3, 11.5, 11.8, 12.0, 12.2], P97: [4.4, 5.8, 7.1, 8.0, 8.7, 9.3, 9.8, 10.3, 10.7, 11.0, 11.4, 11.7, 12.0, 12.3, 12.6, 12.9, 13.2, 13.5, 13.8, 14.1, 14.4, 14.7, 15.0, 15.3, 15.6] },
  },
  girl: {
    height: { P3: [45.6, 49.2, 52.1, 54.2, 55.9, 57.4, 58.7, 59.9, 61.0, 62.2, 63.3, 64.4, 65.4, 66.4, 67.4, 68.3, 69.3, 70.2, 71.1, 72.0, 72.8, 73.7, 74.5, 75.4, 76.2], P50: [49.1, 53.7, 57.1, 59.8, 62.1, 64.0, 65.7, 67.3, 68.7, 70.1, 71.5, 72.8, 74.0, 75.2, 76.4, 77.5, 78.6, 79.7, 80.7, 81.7, 82.7, 83.7, 84.6, 85.5, 86.4], P97: [52.9, 58.1, 62.1, 65.2, 67.8, 70.0, 71.9, 73.7, 75.3, 76.9, 78.4, 79.9, 81.3, 82.7, 84.0, 85.3, 86.6, 87.9, 89.1, 90.3, 91.5, 92.6, 93.7, 94.8, 95.9] },
    weight: { P3: [2.4, 3.2, 4.0, 4.7, 5.1, 5.5, 5.8, 6.1, 6.3, 6.5, 6.7, 6.9, 7.1, 7.2, 7.4, 7.6, 7.8, 7.9, 8.1, 8.2, 8.4, 8.6, 8.7, 8.9, 9.0], P50: [3.2, 4.2, 5.1, 5.8, 6.4, 6.9, 7.3, 7.6, 7.9, 8.2, 8.5, 8.7, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0, 10.2, 10.4, 10.6, 10.9, 11.1, 11.3, 11.5], P97: [4.2, 5.5, 6.6, 7.5, 8.2, 8.8, 9.3, 9.8, 10.2, 10.5, 10.9, 11.2, 11.5, 11.8, 12.1, 12.4, 12.7, 13.0, 13.2, 13.5, 13.8, 14.0, 14.3, 14.6, 14.8] },
  },
};

export type Metric = 'height' | 'weight';
type Gender = 'boy' | 'girl';
const Z97 = 1.880793681; // P3/P97 에 해당하는 표준정규 z

function interp(arr: number[], months: number): number {
  const m = Math.max(0, Math.min(24, months));
  const lo = Math.floor(m), hi = Math.ceil(m);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (m - lo);
}

function normalCdf(z: number): number {
  // Abramowitz-Stegun 근사
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

export interface PctResult { pct: number; z: number; band: { p3: number; p50: number; p97: number }; pos: number; }

/** 측정값의 추정 백분위(0~100) + P3~P97 밴드 + 밴드 내 위치(0~100%) */
export function percentileFor(metric: Metric, gender: Gender, months: number, value: number): PctResult {
  const g = GROWTH_DATA[gender][metric];
  const p3 = interp(g.P3, months), p50 = interp(g.P50, months), p97 = interp(g.P97, months);
  let z: number;
  if (value <= p50) z = p50 === p3 ? 0 : -Z97 * (p50 - value) / (p50 - p3);
  else z = p97 === p50 ? 0 : Z97 * (value - p50) / (p97 - p50);
  const pct = Math.max(0.1, Math.min(99.9, normalCdf(z) * 100));
  const pos = Math.max(0, Math.min(100, ((value - p3) / (p97 - p3)) * 100));
  return { pct, z, band: { p3: round1(p3), p50: round1(p50), p97: round1(p97) }, pos };
}

function round1(n: number) { return Math.round(n * 10) / 10; }

/** 백분위 → "상위 X%" / "하위 Y%" 표현 */
export function rankLabel(pct: number): string {
  const p = Math.round(pct);
  if (p >= 50) return `상위 ${Math.max(1, 100 - p)}%`;
  return `하위 ${Math.max(1, p)}%`;
}

export type Tone = 'ok' | 'watch' | 'warn';

/** 몸무게·키 백분위로 영양 조절 코멘트 생성 */
export function nutritionComment(wPct: number | null, hPct: number | null): { tone: Tone; text: string } {
  if (wPct == null) return { tone: 'ok', text: '키와 몸무게를 함께 입력하면 영양 상태 코멘트를 드려요.' };
  let tone: Tone = 'ok';
  let text: string;
  if (wPct < 3) { tone = 'warn'; text = '몸무게가 3백분위 미만으로 저체중 범위예요. 열량·단백질 보충과 함께 소아과 상담을 권해요.'; }
  else if (wPct < 15) { tone = 'watch'; text = '몸무게가 다소 낮은 편이에요. 수유량·이유식 섭취량을 점검하고, 철분·단백질 재료를 늘려봐요.'; }
  else if (wPct <= 85) { tone = 'ok'; text = '몸무게가 정상 범위예요. 지금 식사 균형을 유지해요.'; }
  else if (wPct <= 97) { tone = 'watch'; text = '몸무게가 다소 높은 편이에요. 수유·간식 양과 균형을 살펴봐요.'; }
  else { tone = 'warn'; text = '몸무게가 97백분위를 넘어요. 섭취 균형을 점검하고 소아과 상담을 권해요.'; }
  // 키 대비 몸무게 (마른/통통)
  if (hPct != null) {
    const diff = wPct - hPct;
    if (diff <= -25) { tone = tone === 'warn' ? 'warn' : 'watch'; text += ' 키에 비해 몸무게 백분위가 낮아 마른 편이라, 열량 보충을 고려해요.'; }
    else if (diff >= 25) { tone = tone === 'warn' ? 'warn' : 'watch'; text += ' 키에 비해 몸무게가 높은 편이에요.'; }
  }
  return { tone, text };
}

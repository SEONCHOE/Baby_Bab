import { NextRequest, NextResponse } from 'next/server';

// 식품안전나라 식품영양성분DB(I2790) 프록시 — 이름으로 100g당 영양 조회
// COOKRCP01과 같은 FOODSAFETY_API_KEY 사용(미설정 시 sample). 로컬 재료 테이블에 없는 재료 확장/검색용.
const BASE = 'http://openapi.foodsafetykorea.go.kr/api';
interface RawRow { [k: string]: string }

export async function GET(req: NextRequest) {
  const key = process.env.FOODSAFETY_API_KEY || 'sample';
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ items: [] });
  const url = `${BASE}/${key}/I2790/json/1/10/DESC_KOR=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    const block = data?.I2790;
    const rows: RawRow[] = block?.row || [];
    const items = rows.map((r) => ({
      name: r.DESC_KOR,
      servingSize: r.SERVING_SIZE || '100g',
      per100g: {
        kcal: num(r.NUTR_CONT1), carb: num(r.NUTR_CONT2), protein: num(r.NUTR_CONT3),
        fat: num(r.NUTR_CONT4), sugarG: num(r.NUTR_CONT5), sodiumMg: num(r.NUTR_CONT6),
      },
    }));
    return NextResponse.json({ items, sample: key === 'sample' });
  } catch (err) {
    console.error('[GET /api/food-nutrition]', err);
    return NextResponse.json({ error: '성분 API 오류' }, { status: 502 });
  }
}

function num(v?: string): number | null { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

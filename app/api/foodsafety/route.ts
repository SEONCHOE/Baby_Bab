import { NextRequest, NextResponse } from 'next/server';

// 식약처 조리식품 레시피 DB(COOKRCP01) 프록시
// 공공데이터 "이용허락범위 제한 없음". 키는 서버 env(FOODSAFETY_API_KEY)로만 사용.
// 키 미설정 시 'sample'(샘플 5건)로 폴백.
const BASE = 'http://openapi.foodsafetykorea.go.kr/api';

interface RawRow { [k: string]: string }

export async function GET(req: NextRequest) {
  const key = process.env.FOODSAFETY_API_KEY || 'sample';
  const q = req.nextUrl.searchParams.get('q')?.trim();
  const start = Math.max(1, Number(req.nextUrl.searchParams.get('start') || 1));
  const end = start + 19; // 페이지당 20건

  let url = `${BASE}/${key}/COOKRCP01/json/${start}/${end}`;
  if (q) url += `/RCP_NM=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    const block = data?.COOKRCP01;
    if (!block || (block.RESULT && block.RESULT.CODE && block.RESULT.CODE !== 'INFO-000')) {
      return NextResponse.json({ total: 0, recipes: [], sample: key === 'sample', message: block?.RESULT?.MSG || '결과 없음' });
    }
    const rows: RawRow[] = block.row || [];
    return NextResponse.json({ total: Number(block.total_count || 0), recipes: rows.map(normalize), sample: key === 'sample' });
  } catch (err) {
    console.error('[GET /api/foodsafety]', err);
    return NextResponse.json({ error: '레시피 API 오류' }, { status: 502 });
  }
}

function normalize(r: RawRow) {
  const steps: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const s = r[`MANUAL${String(i).padStart(2, '0')}`];
    if (s && s.trim()) steps.push(s.replace(/^\s*\d+\.\s*/, '').replace(/[a-z.]\s*$/i, '').trim());
  }
  const https = (u?: string) => (u ? u.replace(/^http:\/\//, 'https://') : '');
  return {
    id: r.RCP_SEQ,
    name: r.RCP_NM,
    way: r.RCP_WAY2 || '',
    category: r.RCP_PAT2 || '',
    ingredients: (r.RCP_PARTS_DTLS || '').replace(/\n+/g, ', ').replace(/,\s*,/g, ',').trim(),
    steps,
    image: https(r.ATT_FILE_NO_MK || r.ATT_FILE_NO_MAIN),
    nutrition: { kcal: r.INFO_ENG || '', carb: r.INFO_CAR || '', protein: r.INFO_PRO || '', fat: r.INFO_FAT || '', na: r.INFO_NA || '' },
    hashTag: r.HASH_TAG || '',
    tip: r.RCP_NA_TIP || '',
  };
}

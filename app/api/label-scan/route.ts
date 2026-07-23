import { NextRequest, NextResponse } from 'next/server';
import { requirePremium } from '@/lib/requirePremium';

// 시판 이유식·간식 영양성분표 사진 → OpenAI vision 분석
// 아기 월령 기준 적절성 판정(나트륨·당·알레르겐) + 대체 추천. requirePremium.
export async function POST(req: NextRequest) {
  const auth = await requirePremium();
  if (auth instanceof NextResponse) return auth;
  const apiKey = req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API 키가 없습니다.' }, { status: 500 });

  try {
    const { image, target, months, stageLabel, conditions } = await req.json();
    if (!image) return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });

    const common = `- verdict: 'ok'(적절) / 'caution'(주의·소량) / 'avoid'(부적합).
- reasons: 판정 이유를 짧게. substitutes: 더 나은 대체 1~3개.
- allergens: 표기된 알레르기 유발 성분(우유·달걀·대두·밀·땅콩·견과·생선·갑각류 등).
- 숫자는 성분표에 보이는 값만. 안 보이면 null.`;

    const system = target === 'mother'
      ? `너는 산모·수유부 영양 도우미야. 시판 식품 '영양성분표' 사진을 읽고, 아래 상태의 엄마에게 적절한지 판정해.
[엄마 상태]: ${(conditions && conditions.length ? conditions.join(', ') : '일반 산모')}
[상태별 기준]
- 모유수유 중: 카페인 과다·알코올·수은 높은 생선 주의, 칼슘·수분·철분은 넉넉히.
- 산후 체중관리/비만: 열량·당류·포화지방·트랜스지방 높으면 주의.
- 임신성 당뇨 이력: 당류·정제탄수 주의.
- 빈혈/철분 부족: 철분 풍부하면 권장.
- 부종·나트륨 주의: 나트륨 높으면 경고.
해당 상태에 맞춰 판정하고, 상태와 무관하면 일반 균형식 기준으로.
${common}`
      : `너는 영유아 식품 안전 도우미야. 시판 식품 '영양성분표' 사진을 읽고, ${months ?? '개월 미상'}개월(${stageLabel || '이유식'}) 아기에게 적절한지 판정해.
[판정 기준]
- 아기는 간을 하지 않아. 나트륨이 높으면 경고(1회 제공량 기준).
- 당류(첨가당) 많으면 경고. 12개월 미만은 꿀·생우유 금지.
${common}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'label', strict: true,
            schema: {
              type: 'object', additionalProperties: false,
              required: ['productName', 'servingSize', 'nutrients', 'allergens', 'verdict', 'reasons', 'substitutes'],
              properties: {
                productName: { type: ['string', 'null'] },
                servingSize: { type: ['string', 'null'] },
                nutrients: {
                  type: 'object', additionalProperties: false,
                  required: ['kcal', 'sodiumMg', 'sugarG', 'proteinG', 'fatG'],
                  properties: { kcal: { type: ['number', 'null'] }, sodiumMg: { type: ['number', 'null'] }, sugarG: { type: ['number', 'null'] }, proteinG: { type: ['number', 'null'] }, fatG: { type: ['number', 'null'] } },
                },
                allergens: { type: 'array', items: { type: 'string' } },
                verdict: { type: 'string', enum: ['ok', 'caution', 'avoid'] },
                reasons: { type: 'array', items: { type: 'string' } },
                substitutes: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: [{ type: 'text', text: '이 영양성분표를 분석해줘.' }, { type: 'image_url', image_url: { url: image } }] },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'AI error' }, { status: res.status });
    return NextResponse.json(JSON.parse(data.choices?.[0]?.message?.content || '{}'));
  } catch (err) {
    console.error('[POST /api/label-scan]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

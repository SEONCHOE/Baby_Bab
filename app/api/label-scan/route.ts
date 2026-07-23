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
    const { image, months, stageLabel } = await req.json();
    if (!image) return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
    const system = `너는 영유아 식품 안전 도우미야. 시판 식품의 '영양성분표' 사진을 읽고, ${months ?? '개월 미상'}개월(${stageLabel || '이유식'}) 아기에게 적절한지 판정해.
[판정 기준]
- 아기는 간을 하지 않아. 나트륨이 높으면 경고(1회 제공량 기준 나트륨이 높을수록 부적합).
- 당류(첨가당) 많으면 경고. 12개월 미만은 꿀·생우유 금지.
- 알레르기 유발(우유·달걀·대두·밀·땅콩·견과·생선·갑각류 등) 성분이 표기되면 반드시 알려줘.
- verdict: 'ok'(적절) / 'caution'(주의·소량) / 'avoid'(부적합).
- reasons: 판정 이유를 짧게. substitutes: 더 나은 대체(무염 홈메이드, 저당 대안 등) 1~3개.
- 숫자는 성분표에 보이는 값만. 안 보이면 null.`;
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

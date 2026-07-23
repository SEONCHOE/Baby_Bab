import { NextRequest, NextResponse } from 'next/server';
import { requirePremium } from '@/lib/requirePremium';

// 음성 발화 → 냉장고 재료 파싱 (OpenAI function-calling)
// 예) "당근 오늘 한개 샀어" / "소분해서 30g씩 6개 냉동했어"
export async function POST(req: NextRequest) {
  const auth = await requirePremium();
  if (auth instanceof NextResponse) return auth;
  const apiKey = req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API 키가 없습니다.' }, { status: 500 });

  try {
    const { transcript, lastItem, candidates } = await req.json();
    const today = new Date().toISOString().slice(0, 10);
    const system = `너는 아기 이유식 냉장고 재고 입력기야. 한국어 발화에서 재료를 구조화해 뽑아줘.
[규칙]
- 여러 재료가 있으면 items 배열에 모두.
- kind: 원재료="ingredient", 소분한 냉동 큐브="cube", 완성된 이유식="prepared".
- "소분/큐브/얼렸/냉동했어" → kind=cube, storage=freezer. "냉장" → fridge, "실온" → room. 명시 없으면 원재료는 fridge.
- 수량: "한개/1개" → quantity=1, unit="개". "30g씩 6개" → cubeCount=6, cubeVolume=30, cubeUnit="g". "30ml씩" → cubeUnit="ml".
- 발화에 재료 이름이 없고 "소분해서 …"처럼 직전에 말한 재료를 가리키면, name 값으로 정확히 "${lastItem || ''}" 문자열을 넣어라. ("직전 재료" 같은 표현을 그대로 넣지 마라.)
- 가능하면 재료명을 아래 사전 표기로 정규화: ${(candidates || []).join(', ')}
- 날짜 기본값 오늘(${today}).`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'pantry_items', strict: true,
            schema: {
              type: 'object', additionalProperties: false, required: ['items'],
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false,
                    required: ['kind', 'name', 'storage', 'quantity', 'unit', 'cubeCount', 'cubeVolume', 'cubeUnit'],
                    properties: {
                      kind: { type: 'string', enum: ['ingredient', 'cube', 'prepared'] },
                      name: { type: 'string' },
                      storage: { type: 'string', enum: ['room', 'fridge', 'freezer'] },
                      quantity: { type: ['number', 'null'] },
                      unit: { type: ['string', 'null'] },
                      cubeCount: { type: ['number', 'null'] },
                      cubeVolume: { type: ['number', 'null'] },
                      cubeUnit: { type: ['string', 'null'], enum: ['ml', 'g', null] },
                    },
                  },
                },
              },
            },
          },
        },
        messages: [{ role: 'system', content: system }, { role: 'user', content: transcript }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'AI error' }, { status: res.status });
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{"items":[]}');
    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[POST /api/pantry-voice]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

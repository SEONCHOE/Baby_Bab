import { NextRequest, NextResponse } from 'next/server';
import { requirePremium } from '@/lib/requirePremium';

// 음성 발화 → 이유식 끼니 기록 파싱 (OpenAI function-calling)
// 예) "오후 2시에 소고기 애호박죽 70g 먹었어" / "쌀미음 절반 먹었어"
export async function POST(req: NextRequest) {
  const auth = await requirePremium();
  if (auth instanceof NextResponse) return auth;
  const apiKey = req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API 키가 없습니다.' }, { status: 500 });

  try {
    const { transcript } = await req.json();
    const now = new Date();
    const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const system = `너는 아기 이유식 끼니 기록기야. 한국어 발화에서 이유식 끼니 정보를 구조화해 뽑아줘.
[규칙]
- menuName: 메뉴 이름(예: "소고기 애호박죽"). 없으면 "이유식".
- time: "오후 2시"→"14:00", "아침 8시반"→"08:30". 언급 없으면 현재(${nowHHMM}).
- eatenG: "70g/70그램" 처럼 g이 명시되면 숫자. 없으면 null.
- intakeRatio: "전량/다"→all, "절반/반"→half, "조금"→little, "안 먹/거부"→refused. 언급 없으면 null.
- composition: "쌀가루20 소고기20 양배추20 물200"처럼 **재료별 g이 발화에 명시된 경우에만** [{name,amountG}] 배열. 메뉴 이름에 재료가 들어 있어도(예: "소고기애호박죽") 각 재료의 g이 없으면 composition은 반드시 null. 추측 금지.`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'meal', strict: true,
            schema: {
              type: 'object', additionalProperties: false,
              required: ['menuName', 'time', 'eatenG', 'intakeRatio', 'composition'],
              properties: {
                menuName: { type: 'string' },
                time: { type: ['string', 'null'] },
                eatenG: { type: ['number', 'null'] },
                intakeRatio: { type: ['string', 'null'], enum: ['all', 'half', 'little', 'refused', null] },
                composition: {
                  type: ['array', 'null'],
                  items: { type: 'object', additionalProperties: false, required: ['name', 'amountG'], properties: { name: { type: 'string' }, amountG: { type: 'number' } } },
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
    return NextResponse.json(JSON.parse(data.choices?.[0]?.message?.content || '{}'));
  } catch (err) {
    console.error('[POST /api/meal-voice]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

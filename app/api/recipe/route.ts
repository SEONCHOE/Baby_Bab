import { NextRequest, NextResponse } from 'next/server';
import { requirePremium } from '@/lib/requirePremium';

// 레시피 하이브리드 추천 — 생성층
// 클라이언트가 규칙 필터(단계 허용/알레르기 제외/재고 매칭)를 끝낸 뒤,
// 후보 재료 목록으로만 제한(lexicon-constrained)해 OpenAI가 조합/조리법/근거를 생성.
export async function POST(req: NextRequest) {
  const auth = await requirePremium();
  if (auth instanceof NextResponse) return auth;

  const apiKey = req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API 키가 설정되지 않았습니다.' }, { status: 500 });

  try {
    const { mode, stageLabel, months, candidates, pantry, allergens, expiringSoon } = await req.json();
    const modeGuide: Record<string, string> = {
      stock_only: '냉장고에 "있는 재료(pantry)"만 사용해 만들 수 있는 레시피를 추천. 재고에 없는 재료는 절대 넣지 마.',
      buy_few: '재고(pantry)를 최대한 쓰되, 추가로 1~2가지만 더 사면 되는 레시피를 추천. 부족한 재료를 missing 배열에 명시.',
      fresh_shop: '재고와 무관하게 단계에 맞는 균형 잡힌 레시피를 추천하고, 필요한 재료 전체를 missing 배열에 담아 장보기 리스트로 제공.',
    };

    const system = `너는 영유아 이유식 전문가야. 아기의 이유식 단계와 안전을 최우선으로 지켜.
[절대 규칙]
- 아래 "허용 후보 재료" 목록에 있는 재료만 사용해. 목록에 없는 재료는 절대 쓰지 마(월령 부적합·알레르기 위험 차단).
- 알레르기 이력 재료(${(allergens || []).join(', ') || '없음'})는 어떤 경우에도 포함하지 마.
- 소진기한 임박 재료(${(expiringSoon || []).join(', ') || '없음'})가 후보에 있으면 우선 활용해.
- 조리는 ${stageLabel} 단계 질감에 맞춰(초기=곱게 간 미음, 중기=으깬 죽, 후기=진밥, 완료기=한입 유아식).
아기 월령: ${months}개월 / 단계: ${stageLabel}
추천 모드: ${modeGuide[mode] || modeGuide.stock_only}`;

    const user = `허용 후보 재료: ${(candidates || []).join(', ')}
냉장고 보유 재료: ${(pantry || []).join(', ') || '없음'}
2~3개의 레시피를 추천해줘.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'recipe_reco',
            strict: true,
            schema: {
              type: 'object', additionalProperties: false,
              required: ['reason', 'recipes'],
              properties: {
                reason: { type: 'string', description: '추천 근거 한 줄' },
                recipes: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false,
                    required: ['title', 'ingredients', 'steps', 'missing', 'nutrition'],
                    properties: {
                      title: { type: 'string' },
                      ingredients: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'amountG'], properties: { name: { type: 'string' }, amountG: { type: 'number' } } } },
                      steps: { type: 'array', items: { type: 'string' } },
                      missing: { type: 'array', items: { type: 'string' }, description: '추가 구매 필요 재료' },
                      nutrition: { type: 'object', additionalProperties: false, required: ['kcal', 'protein', 'ironMg'], properties: { kcal: { type: 'number' }, protein: { type: 'number' }, ironMg: { type: 'number' } } },
                    },
                  },
                },
              },
            },
          },
        },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'AI error' }, { status: res.status });
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{"reason":"","recipes":[]}');
    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[POST /api/recipe]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

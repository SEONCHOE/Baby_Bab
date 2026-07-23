import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getUserId } from '@/lib/session';
import type { RowDataPacket } from 'mysql2';

// 아기의 밥상 집계 로더: 활성 아기 + 냉장고(유저 공용) + 식사기록 + 저장레시피 + 성장 + 평가
// + 공유 수유기록(아기의 기록의 logs, type=feed) 을 한 번에 반환
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const babyId = req.nextUrl.searchParams.get('babyId');
  try {
    const [
      pantryRows, recipeRows, mealRows, growthRows, assessRows, feedRows,
    ] = await Promise.all([
      pool.query<RowDataPacket[]>('SELECT * FROM pantry_items WHERE user_id = ? ORDER BY expiry_date ASC', [userId]),
      pool.query<RowDataPacket[]>('SELECT * FROM saved_recipes WHERE user_id = ? ORDER BY saved_at DESC', [userId]),
      babyId ? pool.query<RowDataPacket[]>('SELECT * FROM meal_logs WHERE baby_id = ? ORDER BY log_date DESC, log_time DESC', [babyId]) : Promise.resolve([[]]),
      babyId ? pool.query<RowDataPacket[]>('SELECT * FROM growth_records WHERE baby_id = ? ORDER BY record_date ASC', [babyId]) : Promise.resolve([[]]),
      babyId ? pool.query<RowDataPacket[]>('SELECT * FROM assessments WHERE baby_id = ? ORDER BY week_of DESC', [babyId]) : Promise.resolve([[]]),
      babyId ? pool.query<RowDataPacket[]>("SELECT id, type, log_date, log_time, start_time, end_time, amount, feed_type, note FROM logs WHERE baby_id = ? AND type = 'feed' ORDER BY log_date DESC, log_time DESC LIMIT 500", [babyId]) : Promise.resolve([[]]),
    ]);

    const pantry = (pantryRows as RowDataPacket[][])[0].map(mapPantry);
    const savedRecipes = (recipeRows as RowDataPacket[][])[0].map(mapRecipe);
    const mealLogs = (mealRows as RowDataPacket[][])[0].map(mapMealLog);
    const growth = (growthRows as RowDataPacket[][])[0].map((r) => ({
      id: r.id, date: String(r.record_date).slice(0, 10),
      height: r.height != null ? Number(r.height) : null,
      weight: r.weight != null ? Number(r.weight) : null,
    }));
    const assessments = (assessRows as RowDataPacket[][])[0].map(mapAssessment);
    const feedingLogs = (feedRows as RowDataPacket[][])[0].map((r) => ({
      id: r.id, date: String(r.log_date).slice(0, 10),
      time: r.log_time ? String(r.log_time).slice(0, 5) : (r.start_time ? String(r.start_time).slice(0, 5) : null),
      amount: r.amount ?? null, feedType: r.feed_type || null, note: r.note || '',
    }));

    return NextResponse.json({ pantry, savedRecipes, mealLogs, growth, assessments, feedingLogs });
  } catch (err) {
    console.error('[GET /api/state]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

function d(v: unknown) { return v ? String(v).slice(0, 10) : null; }
function j<T>(v: unknown, fallback: T): T { if (v == null) return fallback; if (typeof v === 'object') return v as T; try { return JSON.parse(String(v)) as T; } catch { return fallback; } }

function mapPantry(r: RowDataPacket) {
  return {
    id: r.id, kind: r.kind, name: r.name, category: r.category || null, storage: r.storage,
    quantity: r.quantity != null ? Number(r.quantity) : null, unit: r.unit || null,
    cubeCount: r.cube_count ?? null, cubeVolumeMl: r.cube_volume_ml ?? null, cubeUnit: r.cube_unit || 'ml', recipeRef: r.recipe_ref || null,
    purchaseDate: d(r.purchase_date), openDate: d(r.open_date), cookedDate: d(r.cooked_date), expiryDate: d(r.expiry_date),
    forBabyId: r.for_baby_id ?? null, note: r.note || '',
  };
}
function mapRecipe(r: RowDataPacket) {
  return {
    id: r.id, title: r.title, stageTags: j<string[]>(r.stage_tags, []),
    ingredients: j<unknown[]>(r.ingredients, []), steps: j<unknown[]>(r.steps, []),
    nutrition: j<Record<string, number>>(r.nutrition, {}), sourceMode: r.source_mode || null, savedAt: r.saved_at ? Number(r.saved_at) : null,
  };
}
function mapMealLog(r: RowDataPacket) {
  return {
    id: r.id, babyId: r.baby_id, date: d(r.log_date), time: r.log_time ? String(r.log_time).slice(0, 5) : null,
    menuName: r.menu_name || '', recipeRef: r.recipe_ref || null, intakeRatio: r.intake_ratio || null,
    estimatedIntakeG: r.estimated_intake_g ?? null, estimatedKcal: r.estimated_kcal ?? null,
    reaction: r.reaction || '', adverseFlag: !!r.adverse_flag, adverseNote: r.adverse_note || '',
    isNewIngredient: !!r.is_new_ingredient, newIngredientName: r.new_ingredient_name || '',
    beforeMl: r.before_amount_ml ?? null, afterMl: r.after_amount_ml ?? null,
    cubesUsed: j<unknown[]>(r.cubes_used, []), note: r.note || '',
  };
}
function mapAssessment(r: RowDataPacket) {
  return {
    id: r.id, weekOf: d(r.week_of), intakeKcalAvg: r.intake_kcal_avg ?? null, requiredKcal: r.required_kcal ?? null,
    adequacyPct: r.adequacy_pct ?? null, milkSolidRatio: r.milk_solid_ratio || null, llmSummary: r.llm_summary || '',
    createdAt: r.created_at ? Number(r.created_at) : null,
  };
}

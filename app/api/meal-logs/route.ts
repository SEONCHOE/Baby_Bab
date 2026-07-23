import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getUserId } from '@/lib/session';

// 이유식 식사 기록 생성 (아기별)
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const m = await req.json();
    await pool.query(
      `INSERT INTO meal_logs
        (id, baby_id, log_date, log_time, menu_name, recipe_ref, intake_ratio, estimated_intake_g, estimated_kcal,
         reaction, adverse_flag, adverse_note, is_new_ingredient, new_ingredient_name, cubes_used, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        m.id, m.babyId, m.date, m.time || null, m.menuName || null, m.recipeRef || null,
        m.intakeRatio || null, m.estimatedIntakeG ?? null, m.estimatedKcal ?? null,
        m.reaction || null, m.adverseFlag ? 1 : 0, m.adverseNote || null,
        m.isNewIngredient ? 1 : 0, m.newIngredientName || null,
        m.cubesUsed ? JSON.stringify(m.cubesUsed) : null, m.note || null, Date.now(),
      ]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/meal-logs]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

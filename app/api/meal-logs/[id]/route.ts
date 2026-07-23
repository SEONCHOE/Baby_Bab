import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getUserId } from '@/lib/session';

const FIELDS: Record<string, string> = {
  menuName: 'menu_name', time: 'log_time', date: 'log_date', intakeRatio: 'intake_ratio',
  estimatedIntakeG: 'estimated_intake_g', estimatedKcal: 'estimated_kcal', reaction: 'reaction',
  adverseFlag: 'adverse_flag', adverseNote: 'adverse_note', isNewIngredient: 'is_new_ingredient',
  newIngredientName: 'new_ingredient_name', beforeMl: 'before_amount_ml', afterMl: 'after_amount_ml',
  composition: 'composition', batchTotalG: 'batch_total_g', batchRef: 'batch_ref',
};
const JSON_FIELDS = new Set(['composition']);
const BOOL_FIELDS = new Set(['adverseFlag', 'isNewIngredient']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const sets: string[] = [], vals: unknown[] = [];
    for (const [k, col] of Object.entries(FIELDS)) {
      if (!(k in body)) continue;
      let v = body[k];
      if (JSON_FIELDS.has(k)) v = v == null ? null : JSON.stringify(v);
      else if (BOOL_FIELDS.has(k)) v = v ? 1 : 0;
      sets.push(`${col} = ?`); vals.push(v ?? null);
    }
    if (sets.length === 0) return NextResponse.json({ ok: true });
    vals.push(id);
    await pool.query(`UPDATE meal_logs SET ${sets.join(', ')} WHERE id = ?`, vals);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/meal-logs/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    await pool.query('DELETE FROM meal_logs WHERE id = ?', [id]);
    await pool.query('DELETE FROM meal_photos WHERE meal_log_id = ?', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/meal-logs/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

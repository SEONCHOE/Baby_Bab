import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getUserId } from '@/lib/session';

// 냉장고 재고 생성 (가구 공용: user_id 스코프)
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const p = await req.json();
    await pool.query(
      `INSERT INTO pantry_items
        (id, user_id, kind, name, category, storage, quantity, unit, cube_count, cube_volume_ml,
         recipe_ref, purchase_date, open_date, cooked_date, expiry_date, for_baby_id, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id, userId, p.kind || 'ingredient', p.name, p.category || null, p.storage || 'fridge',
        p.quantity ?? null, p.unit || null, p.cubeCount ?? null, p.cubeVolumeMl ?? null,
        p.recipeRef || null, p.purchaseDate || null, p.openDate || null, p.cookedDate || null,
        p.expiryDate || null, p.forBabyId ?? null, p.note || null, Date.now(),
      ]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/pantry]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

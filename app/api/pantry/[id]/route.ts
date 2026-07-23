import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getUserId } from '@/lib/session';

const FIELD_MAP: Record<string, string> = {
  kind: 'kind', name: 'name', category: 'category', storage: 'storage', quantity: 'quantity',
  unit: 'unit', cubeCount: 'cube_count', cubeVolumeMl: 'cube_volume_ml', cubeUnit: 'cube_unit', recipeRef: 'recipe_ref',
  purchaseDate: 'purchase_date', openDate: 'open_date', cookedDate: 'cooked_date',
  expiryDate: 'expiry_date', forBabyId: 'for_baby_id', note: 'note',
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const sets: string[] = [], vals: unknown[] = [];
    for (const [k, col] of Object.entries(FIELD_MAP)) {
      if (k in body) { sets.push(`${col} = ?`); vals.push(body[k] ?? null); }
    }
    if (sets.length === 0) return NextResponse.json({ ok: true });
    vals.push(id, userId);
    await pool.query(`UPDATE pantry_items SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, vals);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/pantry/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    await pool.query('DELETE FROM pantry_items WHERE id = ? AND user_id = ?', [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/pantry/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getUserId } from '@/lib/session';

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

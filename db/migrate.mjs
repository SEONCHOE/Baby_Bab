// MySQL(VIBE_BABY) → Supabase(Postgres) 데이터 이전
// 사용법:
//   1) Supabase SQL Editor에서 db/supabase_schema.sql 실행(테이블 생성)
//   2) .env.local 에 DATABASE_URL(Supabase, 직접연결 5432 또는 세션 pooler) 추가
//   3) node db/migrate.mjs
// 멱등: 재실행해도 ON CONFLICT DO NOTHING 으로 중복 삽입 안 함.
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import pg from 'pg';

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '\\s*=\\s*(.+)', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');

const DATABASE_URL = process.env.DATABASE_URL || get('DATABASE_URL');
if (!DATABASE_URL) { console.error('DATABASE_URL(Supabase)이 .env.local에 없습니다.'); process.exit(1); }

// 부모→자식 순서 (FK 의존성)
const TABLES = [
  'users', 'babies', 'baby_users',
  'logs', 'todos', 'health_logs', 'medications', 'developments', 'growth_records', 'dev_memos',
];

const my = await mysql.createPool({
  host: get('DB_HOST'), port: +(get('DB_PORT') || 3306), user: get('DB_USER'),
  password: get('DB_PASSWORD'), database: get('DB_NAME'), dateStrings: true,
});
const pgPool = new pg.Pool({
  connectionString: DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''),
  ssl: { rejectUnauthorized: false },
});

for (const table of TABLES) {
  const [rows] = await my.query(`SELECT * FROM \`${table}\``);
  if (rows.length === 0) { console.log(`  ${table}: 0건 (건너뜀)`); continue; }
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  let ok = 0;
  for (const row of rows) {
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    const vals = cols.map((c) => row[c]);
    await pgPool.query(
      `INSERT INTO ${table} (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
      vals,
    );
    ok++;
  }
  console.log(`  ${table}: ${ok}건 이전`);
}

// IDENTITY 시퀀스 보정 (명시적 id 삽입 후 다음 값 충돌 방지)
for (const t of ['users', 'babies']) {
  await pgPool.query(
    `SELECT setval(pg_get_serial_sequence('${t}','id'), (SELECT COALESCE(MAX(id),1) FROM ${t}))`,
  );
}
console.log('시퀀스 보정 완료 (users, babies)');

await my.end();
await pgPool.end();
console.log('✅ 이전 완료');

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import ingredientsRef from '@/data/ingredients_ref.json';
import recipesData from '@/data/recipes.json';
import {
  Stage, STAGE_LABELS, STAGE_ICONS, STAGE_MONTHS, stageByMonths, STAGE_ORDER,
  PantryKind, KIND_LABELS, Storage, STORAGE_LABELS,
  IntakeRatio, INTAKE_LABELS,
  getAgeMonths, todayStr, expiryStatus, ddayLabel, daysUntil, uid,
} from '@/lib/meal';

type Page = 'home' | 'fridge' | 'recipe' | 'meallog' | 'baby';

interface Baby { id: number; name: string; birth_date: string; gender: 'boy' | 'girl'; share_code?: string; }
interface PantryItem {
  id: string; kind: PantryKind; name: string; category: string | null; storage: Storage;
  quantity: number | null; unit: string | null; cubeCount: number | null; cubeVolumeMl: number | null;
  recipeRef: string | null; purchaseDate: string | null; openDate: string | null; cookedDate: string | null;
  expiryDate: string | null; forBabyId: number | null; note: string;
}
interface MealLog {
  id: string; babyId: number; date: string | null; time: string | null; menuName: string;
  recipeRef: string | null; intakeRatio: IntakeRatio | null; estimatedKcal: number | null;
  reaction: string; adverseFlag: boolean; adverseNote: string; isNewIngredient: boolean; newIngredientName: string;
}
interface FeedingLog { id: string; date: string; time: string | null; amount: number | null; feedType: string | null; note: string; }
interface AppState { pantry: PantryItem[]; mealLogs: MealLog[]; savedRecipes: unknown[]; growth: unknown[]; assessments: unknown[]; feedingLogs: FeedingLog[]; }

interface RecipeReco { title: string; ingredients: { name: string; amountG: number }[]; steps: string[]; missing: string[]; nutrition: { kcal: number; protein: number; ironMg: number }; }

const REF = (ingredientsRef as { ingredients: IngredientRef[] }).ingredients;
interface IngredientRef { name: string; category: string; allowed_stage: Stage; allergen: boolean | string; forbidden_before_months?: number; }
const BUILTIN_RECIPES = (recipesData as { recipes: BuiltinRecipe[] }).recipes;
interface BuiltinRecipe { id: string; title: string; stage_tags: Stage[]; texture: string; ingredients: { name: string; amountG: number }[]; steps: string[]; nutrition: { kcal: number; protein: number; ironMg: number }; }

const emptyState: AppState = { pantry: [], mealLogs: [], savedRecipes: [], growth: [], assessments: [], feedingLogs: [] };
const STORAGE_ORDER: Storage[] = ['fridge', 'freezer', 'room'];

export default function MealApp() {
  const { status } = useSession();
  const [babies, setBabies] = useState<Baby[]>([]);
  const [activeBabyId, setActiveBabyId] = useState<number | null>(null);
  const [app, setApp] = useState<AppState>(emptyState);
  const [page, setPage] = useState<Page>('home');
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeBaby = useMemo(() => babies.find(b => b.id === activeBabyId) || null, [babies, activeBabyId]);
  const months = activeBaby ? getAgeMonths(activeBaby.birth_date) : null;
  const stage: Stage = months != null ? stageByMonths(months) : 'early';

  function showToast(msg: string) {
    setToast({ msg, show: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2400);
  }

  // ── 로드 ────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/baby').then(r => r.ok ? r.json() : []).then((list: Baby[]) => {
      if (!Array.isArray(list) || list.length === 0) { setBabies([]); return; }
      setBabies(list);
      const cached = Number(localStorage.getItem('active_baby_id'));
      const pick = list.find(b => b.id === cached) || list[0];
      setActiveBabyId(pick.id);
    }).catch(console.error);
  }, [status]);

  useEffect(() => {
    if (activeBabyId == null) return;
    localStorage.setItem('active_baby_id', String(activeBabyId));
    fetch(`/api/state?babyId=${activeBabyId}`).then(r => r.ok ? r.json() : null).then((data: AppState | null) => {
      if (data) setApp({ ...emptyState, ...data });
    }).catch(console.error);
  }, [activeBabyId]);

  // ── 로그인/로딩 화면 ─────────────────────────────────────
  if (status === 'loading') {
    return <div id="app"><div className="baby-loading-screen"><div style={{ fontSize: 40 }}>🍚</div></div></div>;
  }
  if (status === 'unauthenticated') {
    return (
      <div id="app">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 }}>
          <div style={{ fontSize: 56 }}>🍚</div>
          <div className="hand" style={{ fontSize: 30, fontWeight: 700 }}>아기의 밥상</div>
          <div style={{ color: 'var(--text-mid)', fontSize: 14, textAlign: 'center' }}>발달단계에 맞춘 이유식 추천과<br />냉장고 재고 관리를 시작해요</div>
          <button className="btn-primary" onClick={() => signIn('google')}>Google로 시작하기</button>
        </div>
      </div>
    );
  }

  const needBaby = babies.length === 0;

  return (
    <div id="app">
      {/* 헤더 */}
      <header className="app-header">
        <button className="hero-info-pill" style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--orange-pale)', padding: '6px 12px', borderRadius: 'var(--r-pill)' }}
          onClick={() => setPage('baby')}>
          <span style={{ fontSize: 18 }}>{activeBaby?.gender === 'boy' ? '👦' : '👧'}</span>
          <span style={{ fontWeight: 700 }}>{activeBaby?.name || '아기'}</span>
          <span style={{ color: 'var(--text-light)' }}>▾</span>
        </button>
        <div className="hand" style={{ fontSize: 20, fontWeight: 700 }}>아기의 밥상</div>
        <div style={{ width: 32 }} />
      </header>

      {/* 페이지 컨테이너 */}
      <div className="page-container">
        {needBaby ? (
          <NoBaby />
        ) : (
          <>
            <section className={`page${page === 'home' ? ' active' : ''}`}>
              <HomePage stage={stage} months={months} baby={activeBaby} app={app} goRecipe={() => setPage('recipe')} />
            </section>
            <section className={`page${page === 'fridge' ? ' active' : ''}`}>
              <FridgePage app={app} setApp={setApp} showToast={showToast} />
            </section>
            <section className={`page${page === 'recipe' ? ' active' : ''}`}>
              <RecipePage stage={stage} months={months} app={app} showToast={showToast} />
            </section>
            <section className={`page${page === 'meallog' ? ' active' : ''}`}>
              <MealLogPage babyId={activeBabyId!} stage={stage} app={app} setApp={setApp} showToast={showToast} />
            </section>
            <section className={`page${page === 'baby' ? ' active' : ''}`}>
              <BabyPage baby={activeBaby} babies={babies} months={months} stage={stage} setActiveBabyId={setActiveBabyId} />
            </section>
          </>
        )}
      </div>

      {/* 하단 탭 (5칸, 중앙 레시피 강조) */}
      <nav className="bottom-nav" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <NavItem icon="🏠" label="홈" active={page === 'home'} onClick={() => setPage('home')} />
        <NavItem icon="🧊" label="냉장고" active={page === 'fridge'} onClick={() => setPage('fridge')} />
        <NavItem icon="🍳" label="레시피" active={page === 'recipe'} onClick={() => setPage('recipe')} accent />
        <NavItem icon="📝" label="식사기록" active={page === 'meallog'} onClick={() => setPage('meallog')} />
        <NavItem icon="👶" label="아기" active={page === 'baby'} onClick={() => setPage('baby')} />
      </nav>

      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, accent }: { icon: string; label: string; active: boolean; onClick: () => void; accent?: boolean }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick} style={{ background: 'none', border: 'none' }}>
      <span className="nav-icon" style={accent ? { fontSize: 26 } : undefined}>{icon}</span>
      <span className="nav-label" style={accent && !active ? { color: 'var(--orange)' } : undefined}>{label}</span>
    </button>
  );
}

function NoBaby() {
  return (
    <div className="page-scroll" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>👶</div>
      <div className="hand" style={{ fontSize: 22, fontWeight: 700 }}>연결된 아기가 없어요</div>
      <div style={{ color: 'var(--text-mid)', fontSize: 14 }}>&lsquo;아기의 기록&rsquo;에서 만든 아기를 공유코드로 불러오거나<br />새 아기를 추가해 주세요. (다음 단계에서 구현)</div>
    </div>
  );
}

// ── 홈 ──────────────────────────────────────────────────────
function HomePage({ stage, months, baby, app, goRecipe }: { stage: Stage; months: number | null; baby: Baby | null; app: AppState; goRecipe: () => void }) {
  const today = todayStr();
  const todayFeeds = app.feedingLogs.filter(f => f.date === today).length;
  const todayMeals = app.mealLogs.filter(m => m.date === today).length;
  const expiringSoon = app.pantry.filter(p => { const s = expiryStatus(p.expiryDate); return s === 'soon' || s === 'expired'; });

  return (
    <div className="page-scroll">
      <div className="section-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 40 }}>{STAGE_ICONS[stage]}</div>
          <div>
            <div className="hand" style={{ fontSize: 24, fontWeight: 700 }}>{baby?.name}</div>
            <div style={{ color: 'var(--text-mid)', fontSize: 13 }}>{months != null ? `${months}개월` : ''} · 이유식 <b style={{ color: 'var(--orange)' }}>{STAGE_LABELS[stage]}</b> ({STAGE_MONTHS[stage]})</div>
          </div>
        </div>
      </div>

      <div className="section-card">
        <h3 className="section-title hand">오늘 식사</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <Stat label="수유" value={`${todayFeeds}회`} />
          <Stat label="이유식" value={`${todayMeals}회`} />
        </div>
      </div>

      <div className="section-card">
        <h3 className="section-title hand">소진기한 임박</h3>
        {expiringSoon.length === 0 ? (
          <div style={{ color: 'var(--text-light)', fontSize: 14 }}>임박한 재료가 없어요 👍</div>
        ) : expiringSoon.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{KIND_LABELS[p.kind] === '원재료' ? '' : '🧊 '}{p.name}</span>
            <DdayBadge date={p.expiryDate} />
          </div>
        ))}
      </div>

      <button className="btn-primary btn-full" onClick={goRecipe}>🍳 오늘 뭐 만들까?</button>
      <div style={{ height: 12 }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--orange-pale)', borderRadius: 'var(--r-md)', padding: '12px', textAlign: 'center' }}>
      <div className="hand" style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{label}</div>
    </div>
  );
}

function DdayBadge({ date }: { date: string | null }) {
  const s = expiryStatus(date);
  if (s === 'none') return null;
  const color = s === 'expired' ? 'var(--c-cry)' : s === 'soon' ? 'var(--orange)' : 'var(--lime)';
  const bg = s === 'expired' ? 'var(--bg-cry)' : s === 'soon' ? 'var(--orange-pale)' : 'var(--lime-pale)';
  return <span style={{ color, background: bg, fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-pill)' }}>{ddayLabel(date)}</span>;
}

// ── 냉장고 ───────────────────────────────────────────────────
function FridgePage({ app, setApp, showToast }: { app: AppState; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void }) {
  const [filter, setFilter] = useState<'all' | PantryKind>('all');
  const [adding, setAdding] = useState(false);
  const items = app.pantry.filter(p => filter === 'all' || p.kind === filter);

  function remove(id: string) {
    setApp(s => ({ ...s, pantry: s.pantry.filter(p => p.id !== id) }));
    fetch(`/api/pantry/${id}`, { method: 'DELETE' }).catch(console.error);
    showToast('삭제했어요');
  }

  return (
    <div className="page-scroll">
      <div className="date-nav" style={{ marginBottom: 12 }}>
        {(['all', 'ingredient', 'cube', 'prepared'] as const).map(f => (
          <button key={f} className="kw-chip" style={filter === f ? { background: 'var(--orange)', color: '#fff', borderColor: 'var(--orange)' } : undefined} onClick={() => setFilter(f)}>
            {f === 'all' ? '전체' : KIND_LABELS[f]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="section-card" style={{ textAlign: 'center', color: 'var(--text-light)' }}>재고가 비어 있어요. + 로 추가해 주세요.</div>
      ) : items.map(p => (
        <div key={p.id} className="section-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{p.kind !== 'ingredient' ? (p.kind === 'cube' ? '🧊 ' : '🥣 ') : ''}{p.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
              {STORAGE_LABELS[p.storage]}
              {p.kind === 'cube' && p.cubeCount ? ` · ${p.cubeCount}개${p.cubeVolumeMl ? ` × ${p.cubeVolumeMl}ml` : ''}` : (p.quantity ? ` · ${p.quantity}${p.unit || ''}` : '')}
              {p.purchaseDate ? ` · 구매 ${p.purchaseDate.slice(5)}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DdayBadge date={p.expiryDate} />
            <button onClick={() => remove(p.id)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', fontSize: 18 }}>✕</button>
          </div>
        </div>
      ))}
      <div style={{ height: 76 }} />

      <button className="fab-btn" style={{ position: 'absolute', right: 18, bottom: 18 }} onClick={() => setAdding(true)}>+</button>
      {adding && <AddPantryModal onClose={() => setAdding(false)} setApp={setApp} showToast={showToast} />}
    </div>
  );
}

function AddPantryModal({ onClose, setApp, showToast }: { onClose: () => void; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void }) {
  const [kind, setKind] = useState<PantryKind>('ingredient');
  const [name, setName] = useState('');
  const [storage, setStorage] = useState<Storage>('fridge');
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [expiryDate, setExpiryDate] = useState('');
  const [cubeCount, setCubeCount] = useState('');
  const [cubeVolumeMl, setCubeVolumeMl] = useState('');
  const suggestions = REF.filter(r => name && r.name.includes(name)).slice(0, 6);

  function pickSuggestion(r: IngredientRef) {
    setName(r.name);
    const days = (r as unknown as { default_expiry_days?: Record<string, number> }).default_expiry_days?.[storage];
    if (days != null) { const d = new Date(); d.setDate(d.getDate() + days); setExpiryDate(d.toISOString().slice(0, 10)); }
  }

  function save() {
    if (!name.trim()) { showToast('재료명을 입력해 주세요'); return; }
    const item: PantryItem = {
      id: uid(), kind, name: name.trim(), category: REF.find(r => r.name === name.trim())?.category || null, storage,
      quantity: null, unit: null, cubeCount: cubeCount ? Number(cubeCount) : null, cubeVolumeMl: cubeVolumeMl ? Number(cubeVolumeMl) : null,
      recipeRef: null, purchaseDate: purchaseDate || null, openDate: null, cookedDate: null, expiryDate: expiryDate || null, forBabyId: null, note: '',
    };
    setApp(s => ({ ...s, pantry: [item, ...s.pantry] }));
    fetch('/api/pantry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }).catch(console.error);
    showToast('재료를 추가했어요');
    onClose();
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="section-title hand">재료 추가</h3>
        <div className="form-group">
          <label>종류</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['ingredient', 'cube', 'prepared'] as PantryKind[]).map(k => (
              <button key={k} className="kw-chip" style={kind === k ? { background: 'var(--orange)', color: '#fff', borderColor: 'var(--orange)' } : undefined} onClick={() => setKind(k)}>{KIND_LABELS[k]}</button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>이름</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 애호박" />
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {suggestions.map(r => <button key={r.name} className="kw-chip" onClick={() => pickSuggestion(r)}>{r.name}</button>)}
            </div>
          )}
        </div>
        <div className="form-group">
          <label>보관</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {STORAGE_ORDER.map(s => (
              <button key={s} className="kw-chip" style={storage === s ? { background: 'var(--orange)', color: '#fff', borderColor: 'var(--orange)' } : undefined} onClick={() => setStorage(s)}>{STORAGE_LABELS[s]}</button>
            ))}
          </div>
        </div>
        {kind === 'cube' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="form-group" style={{ flex: 1 }}><label>큐브 수</label><input type="number" value={cubeCount} onChange={e => setCubeCount(e.target.value)} placeholder="6" /></div>
            <div className="form-group" style={{ flex: 1 }}><label>용량(ml)</label><input type="number" value={cubeVolumeMl} onChange={e => setCubeVolumeMl(e.target.value)} placeholder="30" /></div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="form-group" style={{ flex: 1 }}><label>{kind === 'cube' ? '소분일' : '구매일'}</label><input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>소진기한</label><input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></div>
        </div>
        <button className="btn-primary btn-full" onClick={save}>추가하기</button>
      </div>
    </div>
  );
}

// ── 레시피 (3-모드 하이브리드) ────────────────────────────────
function RecipePage({ stage, months, app, showToast }: { stage: Stage; months: number | null; app: AppState; showToast: (m: string) => void }) {
  const [mode, setMode] = useState<'stock_only' | 'buy_few' | 'fresh_shop' | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ reason: string; recipes: RecipeReco[] } | null>(null);

  // 규칙 필터층: 단계 허용 + 월령 금지 + (알레르기 이력은 추후) → 후보 재료
  const allowedByStage = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(stage) + 1);
  const candidates = REF.filter(r =>
    allowedByStage.includes(r.allowed_stage) &&
    !(r.forbidden_before_months && months != null && months < r.forbidden_before_months)
  ).map(r => r.name);
  const pantryNames = Array.from(new Set(app.pantry.map(p => p.name)));
  const expiringSoon = app.pantry.filter(p => expiryStatus(p.expiryDate) === 'soon').map(p => p.name);

  async function run(m: 'stock_only' | 'buy_few' | 'fresh_shop') {
    setMode(m); setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, stageLabel: STAGE_LABELS[stage], months, candidates, pantry: pantryNames, allergens: [], expiringSoon }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error === 'PREMIUM_REQUIRED' ? '프리미엄 기능이에요' : (data.error || '추천 실패')); return; }
      setResult(data);
    } catch { showToast('추천 중 오류가 발생했어요'); }
    finally { setLoading(false); }
  }

  const builtinForStage = BUILTIN_RECIPES.filter(r => r.stage_tags.includes(stage));

  return (
    <div className="page-scroll">
      <div className="section-card">
        <h3 className="section-title hand">오늘의 이유식 추천</h3>
        <div style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>{STAGE_LABELS[stage]} 단계 · 냉장고 재료 {pantryNames.length}종</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ModeBtn active={mode === 'stock_only'} title="있는 걸로 만들기" desc="냉장고 재료만으로" onClick={() => run('stock_only')} />
          <ModeBtn active={mode === 'buy_few'} title="한두 가지만 더 사서" desc="부족한 재료 1~2개만" onClick={() => run('buy_few')} />
          <ModeBtn active={mode === 'fresh_shop'} title="새로 장보고 만들기" desc="단계에 맞춰 새로" onClick={() => run('fresh_shop')} />
        </div>
      </div>

      {loading && <div className="section-card" style={{ textAlign: 'center' }}>🍳 레시피를 고르는 중…</div>}

      {result && (
        <>
          <div className="section-card" style={{ background: 'var(--lime-pale)' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>💡 {result.reason}</div>
          </div>
          {result.recipes.map((r, i) => (
            <div key={i} className="section-card">
              <div className="hand" style={{ fontSize: 19, fontWeight: 700 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-mid)', margin: '4px 0 10px' }}>약 {r.nutrition.kcal}kcal · 단백질 {r.nutrition.protein}g · 철분 {r.nutrition.ironMg}mg</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                {r.ingredients.map(ing => (
                  <span key={ing.name} className="kw-chip" style={{ marginRight: 6, marginBottom: 6, display: 'inline-block', ...(pantryNames.includes(ing.name) ? { background: 'var(--lime-pale)', borderColor: 'var(--lime)' } : {}) }}>
                    {pantryNames.includes(ing.name) ? '✓ ' : ''}{ing.name} {ing.amountG}g
                  </span>
                ))}
              </div>
              {r.missing.length > 0 && <div style={{ fontSize: 12, color: 'var(--orange)', marginBottom: 8 }}>🛒 추가 구매: {r.missing.join(', ')}</div>}
              <ol style={{ fontSize: 13, paddingLeft: 18, color: 'var(--text)', lineHeight: 1.6 }}>
                {r.steps.map((s, j) => <li key={j}>{s}</li>)}
              </ol>
            </div>
          ))}
        </>
      )}

      {!result && !loading && (
        <div className="section-card">
          <h3 className="section-title hand" style={{ fontSize: 17 }}>{STAGE_LABELS[stage]} 기본 레시피</h3>
          {builtinForStage.map(r => (
            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{r.texture} · {r.ingredients.map(i => i.name).join(', ')}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 12 }} />
    </div>
  );
}

function ModeBtn({ active, title, desc, onClick }: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 'var(--r-md)', border: `1.5px solid ${active ? 'var(--orange)' : 'var(--border)'}`, background: active ? 'var(--orange-pale)' : '#fff' }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{desc}</div>
    </button>
  );
}

// ── 식사기록 ─────────────────────────────────────────────────
function MealLogPage({ babyId, stage, app, setApp, showToast }: { babyId: number; stage: Stage; app: AppState; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  // 수유(공유) + 이유식 통합 타임라인
  const merged = [
    ...app.feedingLogs.map(f => ({ kind: 'feed' as const, date: f.date, time: f.time, label: `수유 ${f.feedType || ''} ${f.amount ? f.amount + 'ml' : ''}`.trim(), id: f.id })),
    ...app.mealLogs.map(m => ({ kind: 'meal' as const, date: m.date || '', time: m.time, label: `${m.menuName || '이유식'}${m.intakeRatio ? ` · ${INTAKE_LABELS[m.intakeRatio]}` : ''}`, id: m.id, adverse: m.adverseFlag })),
  ].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

  return (
    <div className="page-scroll">
      {merged.length === 0 ? (
        <div className="section-card" style={{ textAlign: 'center', color: 'var(--text-light)' }}>아직 기록이 없어요. + 로 추가해 주세요.</div>
      ) : merged.map(row => (
        <div key={row.kind + row.id} className="section-card" style={{ display: 'flex', alignItems: 'center', gap: 10, background: row.kind === 'feed' ? 'var(--bg-feed)' : '#fff' }}>
          <span style={{ fontSize: 20 }}>{row.kind === 'feed' ? '🍼' : '🍚'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{row.label}{'adverse' in row && row.adverse ? ' ⚠️' : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{row.date} {row.time || ''}</div>
          </div>
        </div>
      ))}
      <div style={{ height: 76 }} />
      <button className="fab-btn" style={{ position: 'absolute', right: 18, bottom: 18 }} onClick={() => setAdding(true)}>+</button>
      {adding && <AddMealModal babyId={babyId} onClose={() => setAdding(false)} setApp={setApp} showToast={showToast} />}
    </div>
  );
}

function AddMealModal({ babyId, onClose, setApp, showToast }: { babyId: number; onClose: () => void; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void }) {
  const [menuName, setMenuName] = useState('');
  const [intakeRatio, setIntakeRatio] = useState<IntakeRatio>('all');
  const [reaction, setReaction] = useState('');
  const [adverseFlag, setAdverseFlag] = useState(false);
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  function save() {
    if (!menuName.trim()) { showToast('메뉴를 입력해 주세요'); return; }
    const m: MealLog = {
      id: uid(), babyId, date: todayStr(), time, menuName: menuName.trim(), recipeRef: null,
      intakeRatio, estimatedKcal: null, reaction: reaction.trim(), adverseFlag, adverseNote: '', isNewIngredient: false, newIngredientName: '',
    };
    setApp(s => ({ ...s, mealLogs: [m, ...s.mealLogs] }));
    fetch('/api/meal-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }).catch(console.error);
    showToast('식사를 기록했어요');
    onClose();
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="section-title hand">이유식 기록</h3>
        <div className="form-group"><label>메뉴</label><input value={menuName} onChange={e => setMenuName(e.target.value)} placeholder="예: 소고기 애호박죽" /></div>
        <div className="form-group">
          <label>섭취량</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'half', 'little', 'refused'] as IntakeRatio[]).map(r => (
              <button key={r} className="kw-chip" style={intakeRatio === r ? { background: 'var(--orange)', color: '#fff', borderColor: 'var(--orange)' } : undefined} onClick={() => setIntakeRatio(r)}>{INTAKE_LABELS[r]}</button>
            ))}
          </div>
        </div>
        <div className="form-group"><label>반응 메모</label><textarea value={reaction} onChange={e => setReaction(e.target.value)} placeholder="잘 먹었어요 / 입에 안 맞아 했어요" /></div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={adverseFlag} onChange={e => setAdverseFlag(e.target.checked)} style={{ width: 'auto' }} />
            이상반응(발진·구토·설사 등)이 있었어요
          </label>
        </div>
        <button className="btn-primary btn-full" onClick={save}>기록하기</button>
      </div>
    </div>
  );
}

// ── 아기 ─────────────────────────────────────────────────────
function BabyPage({ baby, babies, months, stage, setActiveBabyId }: { baby: Baby | null; babies: Baby[]; months: number | null; stage: Stage; setActiveBabyId: (id: number) => void }) {
  return (
    <div className="page-scroll">
      <div className="section-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 40 }}>{baby?.gender === 'boy' ? '👦' : '👧'}</div>
          <div>
            <div className="hand" style={{ fontSize: 24, fontWeight: 700 }}>{baby?.name}</div>
            <div style={{ color: 'var(--text-mid)', fontSize: 13 }}>{months != null ? `${months}개월` : ''} · {baby?.birth_date}</div>
          </div>
        </div>
      </div>

      {babies.length > 1 && (
        <div className="section-card">
          <h3 className="section-title hand" style={{ fontSize: 17 }}>아기 전환</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {babies.map(b => (
              <button key={b.id} className="kw-chip" style={b.id === baby?.id ? { background: 'var(--orange)', color: '#fff', borderColor: 'var(--orange)' } : undefined} onClick={() => setActiveBabyId(b.id)}>{b.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="section-card">
        <h3 className="section-title hand" style={{ fontSize: 17 }}>이유식 단계</h3>
        <div style={{ fontSize: 15 }}>{STAGE_ICONS[stage]} 현재 <b style={{ color: 'var(--orange)' }}>{STAGE_LABELS[stage]}</b> ({STAGE_MONTHS[stage]})</div>
        <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 8 }}>월령 기준 권장 단계예요. 발달 체크(목 가누기·혀 밀어내기 반사·음식 관심 등)로 정밀 판정은 다음 단계에서 제공돼요. 단계 전환은 소아과 상담을 함께 권해요.</div>
      </div>

      {baby?.share_code && (
        <div className="section-card">
          <h3 className="section-title hand" style={{ fontSize: 17 }}>공유코드</h3>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: 'var(--orange)' }}>{baby.share_code}</div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>&lsquo;아기의 기록&rsquo;과 같은 코드로 프로필·수유·성장 기록을 공유해요.</div>
        </div>
      )}

      <button className="btn-secondary btn-full" onClick={() => signOut()}>로그아웃</button>
      <div style={{ height: 12 }} />
    </div>
  );
}

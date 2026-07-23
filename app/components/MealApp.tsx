'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import ingredientsRef from '@/data/ingredients_ref.json';
import recipesData from '@/data/recipes.json';
import {
  Stage, STAGE_LABELS, STAGE_ICONS, STAGE_MONTHS, STAGE_ORDER, stageByMonths, stageProgress,
  PantryKind, KIND_LABELS, Storage, STORAGE_LABELS, IntakeRatio, INTAKE_LABELS,
  getAgeMonths, todayStr, expiryStatus, ddayLabel, daysUntil, uid, ingredientEmoji, monthsBetween,
} from '@/lib/meal';
import { percentileFor, rankLabel, nutritionComment, PctResult, GROWTH_DATA, Metric } from '@/lib/growth';

type Route = 'home' | 'fridge' | 'recipe' | 'log' | 'baby';

interface Baby { id: number; name: string; birth_date: string; gender: 'boy' | 'girl'; share_code?: string; }
interface PantryItem {
  id: string; kind: PantryKind; name: string; category: string | null; storage: Storage;
  quantity: number | null; unit: string | null; cubeCount: number | null; cubeVolumeMl: number | null; cubeUnit: string | null;
  recipeRef: string | null; purchaseDate: string | null; openDate: string | null; cookedDate: string | null;
  expiryDate: string | null; forBabyId: number | null; note: string;
}
interface MealLog {
  id: string; babyId: number; date: string | null; time: string | null; menuName: string;
  recipeRef: string | null; intakeRatio: IntakeRatio | null; estimatedKcal: number | null;
  reaction: string; adverseFlag: boolean; adverseNote: string; isNewIngredient: boolean; newIngredientName: string;
  beforeMl: number | null; afterMl: number | null;
}
interface FeedingLog { id: string; date: string; time: string | null; amount: number | null; feedType: string | null; note: string; }
interface Growth { id: string; date: string; height: number | null; weight: number | null; }
interface AppState { pantry: PantryItem[]; mealLogs: MealLog[]; savedRecipes: unknown[]; growth: Growth[]; assessments: unknown[]; feedingLogs: FeedingLog[]; }
interface RecipeReco { title: string; ingredients: { name: string; amountG: number }[]; steps: string[]; missing: string[]; nutrition: { kcal: number; protein: number; ironMg: number }; }
interface FsRecipe { id: string; name: string; way: string; category: string; ingredients: string; steps: string[]; image: string; nutrition: { kcal: string; protein: string }; hashTag: string; }

interface IngredientRef { name: string; category: string; allowed_stage: Stage; allergen: boolean | string; forbidden_before_months?: number; default_expiry_days?: Record<string, number>; }
const REF = (ingredientsRef as { ingredients: IngredientRef[] }).ingredients;
const CAT_ORDER = ['곡류', '채소', '육류', '난류', '어류', '콩류', '과일', '유제품', '기타'];
const BY_CAT: Record<string, IngredientRef[]> = {};
for (const r of REF) (BY_CAT[r.category] ||= []).push(r);
const CATS = CAT_ORDER.filter(c => BY_CAT[c]?.length);
interface BuiltinRecipe { id: string; title: string; stage_tags: Stage[]; texture: string; ingredients: { name: string; amountG: number }[]; steps: string[]; nutrition: { kcal: number; protein: number; ironMg: number }; }
const BUILTIN = (recipesData as { recipes: BuiltinRecipe[] }).recipes;

const empty: AppState = { pantry: [], mealLogs: [], savedRecipes: [], growth: [], assessments: [], feedingLogs: [] };
const STORAGE_ORDER: Storage[] = ['fridge', 'freezer', 'room'];

function stockBg(p: PantryItem): string {
  if (p.kind === 'prepared') return 'bg-solid';
  const c = p.category || '';
  if (c.includes('육') || c.includes('어')) return 'bg-cry';
  if (c.includes('과일')) return 'bg-feed';
  if (c.includes('곡')) return 'bg-diaper';
  return 'bg-walk';
}

export default function MealApp() {
  const { status } = useSession();
  const [babies, setBabies] = useState<Baby[]>([]);
  const [activeBabyId, setActiveBabyId] = useState<number | null>(null);
  const [app, setApp] = useState<AppState>(empty);
  const [route, setRoute] = useState<Route>('home');
  const [toast, setToast] = useState({ msg: '', show: false });
  const [sheet, setSheet] = useState<null | 'pantry' | 'meal' | 'babySwitch'>(null);
  const tt = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baby = useMemo(() => babies.find(b => b.id === activeBabyId) || null, [babies, activeBabyId]);
  const months = baby ? getAgeMonths(baby.birth_date) : null;
  const stage: Stage = months != null ? stageByMonths(months) : 'early';

  function showToast(msg: string) {
    setToast({ msg, show: true });
    if (tt.current) clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2200);
  }
  function go(r: Route) { setRoute(r); }

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/baby').then(r => r.ok ? r.json() : []).then((list: Baby[]) => {
      if (!Array.isArray(list) || list.length === 0) { setBabies([]); return; }
      setBabies(list);
      const cached = Number(localStorage.getItem('active_baby_id'));
      setActiveBabyId((list.find(b => b.id === cached) || list[0]).id);
    }).catch(console.error);
  }, [status]);

  useEffect(() => {
    if (activeBabyId == null) return;
    localStorage.setItem('active_baby_id', String(activeBabyId));
    fetch(`/api/state?babyId=${activeBabyId}`).then(r => r.ok ? r.json() : null).then((d: AppState | null) => {
      if (d) setApp({ ...empty, ...d });
    }).catch(console.error);
  }, [activeBabyId]);

  if (status === 'loading') {
    return <div className="stage"><main className="phone"><div className="login-wrap"><div className="login-face">🍚</div></div></main></div>;
  }
  if (status === 'unauthenticated') {
    return (
      <div className="stage"><main className="phone">
        <div className="login-wrap">
          <div className="login-face">🍚</div>
          <div className="login-title">아기의 밥상</div>
          <div className="login-sub">발달단계에 맞춘 이유식 추천과<br />냉장고 재고 관리를 시작해요</div>
          <button className="btn-orange" onClick={() => signIn('google')}>Google로 시작하기</button>
        </div>
      </main></div>
    );
  }

  const noBaby = babies.length === 0;

  return (
    <div className="stage">
      <aside className="ambient ambient--left" aria-hidden="true">
        <div className="ambient-card">
          <div className="ambient-label">오늘의 한 끼</div>
          <div className="ambient-title">발달에 맞춰<br />고르는 이유식</div>
          <div className="ambient-sub">냉장고에 있는 재료로<br />바로 만들 수 있는 레시피를 추천해요.</div>
        </div>
      </aside>

      <main className="phone">
        <div className="status-bar" aria-hidden="true"><span>9:41</span><span className="status-icons">📶 🔋</span></div>

        <header className="app-header">
          <button className="baby-chip" onClick={() => babies.length > 1 ? setSheet('babySwitch') : go('baby')}>
            <span className="baby-chip__face">{baby?.gender === 'boy' ? '👦' : '👧'}</span>
            <span className="baby-chip__name">{baby?.name || '아기'}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <div className="app-header__title">아기의 밥상</div>
          <button className="bell" aria-label="알림">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
            <span className="bell-dot" />
          </button>
        </header>

        {noBaby ? (
          <div className="screen is-active"><div className="empty-note" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 46, marginBottom: 10 }}>👶</div>
            연결된 아기가 없어요.<br />&lsquo;아기의 기록&rsquo;에서 공유코드로 아기를 불러오거나<br />새로 추가해 주세요.
          </div></div>
        ) : (
          <>
            <HomeScreen active={route === 'home'} baby={baby} months={months} stage={stage} app={app} go={go} />
            <FridgeScreen active={route === 'fridge'} app={app} setApp={setApp} showToast={showToast} openAdd={() => setSheet('pantry')} />
            <RecipeScreen active={route === 'recipe'} baby={baby} months={months} stage={stage} app={app} showToast={showToast} />
            <LogScreen active={route === 'log'} app={app} openAdd={() => setSheet('meal')} />
            <BabyScreen active={route === 'baby'} baby={baby} babies={babies} months={months} stage={stage} growth={app.growth} setApp={setApp} showToast={showToast} setActiveBabyId={setActiveBabyId} />
          </>
        )}

        <nav className="tabbar" role="tablist">
          <Tab r="home" cur={route} onClick={go} label="홈"><path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2v-9z" /></Tab>
          <Tab r="fridge" cur={route} onClick={go} label="냉장고"><rect x="5" y="2" width="14" height="20" rx="3" /><path d="M5 10h14M9 5v2M9 13v3" /></Tab>
          <button className={`tab tab--center${route === 'recipe' ? ' is-active' : ''}`} onClick={() => go('recipe')} aria-label="레시피">
            <span className="tab-center-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c-3 0-5 2-5 5 0 2 1 3 1 5h8c0-2 1-3 1-5 0-3-2-5-5-5zM8 18h8M9 21h6" /></svg></span>
            <span className="center-label">레시피</span>
          </button>
          <Tab r="log" cur={route} onClick={go} label="식사기록"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></Tab>
          <Tab r="baby" cur={route} onClick={go} label="아기"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></Tab>
        </nav>

        {sheet === 'pantry' && <PantrySheet onClose={() => setSheet(null)} setApp={setApp} showToast={showToast} />}
        {sheet === 'meal' && baby && <MealSheet babyId={baby.id} onClose={() => setSheet(null)} setApp={setApp} showToast={showToast} />}
        {sheet === 'babySwitch' && <BabySwitchSheet babies={babies} activeId={activeBabyId} onPick={id => { setActiveBabyId(id); setSheet(null); }} onClose={() => setSheet(null)} />}

        <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
      </main>

      <aside className="ambient ambient--right" aria-hidden="true">
        <div className="ambient-card ambient-card--tilt">
          <div className="ambient-label">이유식 {STAGE_LABELS[stage]}</div>
          <div className="ambient-title">한 숟갈부터<br />천천히</div>
          <div className="ambient-sub">발달과 재고에 맞춰<br />오늘의 한 끼를 골라요.</div>
        </div>
      </aside>
    </div>
  );
}

function Tab({ r, cur, onClick, label, children }: { r: Route; cur: Route; onClick: (r: Route) => void; label: string; children: React.ReactNode }) {
  return (
    <button className={`tab${cur === r ? ' is-active' : ''}`} onClick={() => onClick(r)} role="tab" aria-selected={cur === r}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
      <span>{label}</span>
    </button>
  );
}

function Dday({ date }: { date: string | null }) {
  const s = expiryStatus(date);
  if (s === 'none') return null;
  const cls = s === 'safe' ? 'ok' : s === 'soon' ? 'warn' : 'exp';
  return <span className={`dday ${cls}`}>{s === 'expired' ? '경과' : ddayLabel(date)}</span>;
}

// ── HOME ────────────────────────────────────────────────────
function HomeScreen({ active, baby, months, stage, app, go }: { active: boolean; baby: Baby | null; months: number | null; stage: Stage; app: AppState; go: (r: Route) => void }) {
  const today = todayStr();
  const feeds = app.feedingLogs.filter(f => f.date === today);
  const meals = app.mealLogs.filter(m => m.date === today);
  const totalMl = feeds.reduce((s, f) => s + (f.amount || 0), 0);
  const expiring = app.pantry.filter(p => { const s = expiryStatus(p.expiryDate); return s === 'soon' || s === 'expired'; });
  const newObs = app.mealLogs.filter(m => m.isNewIngredient && m.date && (daysUntil(m.date) ?? -99) >= -3);

  return (
    <section className={`screen${active ? ' is-active' : ''}`}>
      <div className="home">
        <div className="meal-hero">
          <div className="row">
            <div className="face">{STAGE_ICONS[stage]}</div>
            <div>
              <div className="name">{baby?.name}의 밥상</div>
              <div className="meta">
                <span className="pill">{months != null ? `${months}개월` : ''}</span>
                <span className="pill pill--stage">이유식 {STAGE_LABELS[stage]}</span>
              </div>
            </div>
          </div>
          <div className="hero-progress">
            <div className="hero-progress__head"><span>{STAGE_LABELS[stage]} · {STAGE_MONTHS[stage]}</span><span className="muted">월령 기준 권장</span></div>
            <div className="stage-track"><span style={{ width: `${months != null ? stageProgress(months) : 0}%` }} /></div>
            <div className="stage-marks">{STAGE_ORDER.map(s => <span key={s} className={s === stage ? 'on' : ''}>{STAGE_LABELS[s]}</span>)}</div>
          </div>
        </div>

        <div className="section">
          <div className="section-head"><h3 className="h3">이번 주 식사 적정성</h3></div>
          <div className="adequacy-card">
            <div className="gauge" style={{ ['--pct' as string]: 0 }}><div className="gauge__num"><b>—</b></div></div>
            <div className="adequacy-body">
              <div className="adequacy-tag tone-ok">준비중</div>
              <div className="adequacy-txt">식사·수유 기록이 쌓이면 필요 열량 대비 섭취 적정성을 평가해 드려요.</div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-head"><h3 className="h3">오늘의 식사</h3><span className="more" onClick={() => go('log')}>타임라인 ›</span></div>
          <div className="today-grid">
            <div className="today-cell"><div className="ico bg-feed">🍼</div><div className="v">{feeds.length}<span>회</span></div><div className="k">수유</div></div>
            <div className="today-cell"><div className="ico bg-solid">🥣</div><div className="v">{meals.length}<span>회</span></div><div className="k">이유식</div></div>
            <div className="today-cell"><div className="ico bg-diaper">⚖️</div><div className="v">{totalMl}<span>ml</span></div><div className="k">수유량</div></div>
          </div>
        </div>

        <div className="section">
          <div className="section-head"><h3 className="h3">챙길 거리</h3></div>
          {expiring.length === 0 && newObs.length === 0 && <div className="empty-note" style={{ padding: '14px' }}>임박한 재료나 관찰 중인 새 재료가 없어요 👍</div>}
          {expiring.map(p => (
            <div key={p.id} className="alert-card tone-warn">
              <span className="alert-ico">{p.kind === 'cube' ? '🧊' : ingredientEmoji(p.name)}</span>
              <div className="alert-body"><div className="t">{p.name} 소진 임박</div><div className="d">{STORAGE_LABELS[p.storage]}{p.cubeCount ? ` · ${p.cubeCount}개 남음` : ''}</div></div>
              <Dday date={p.expiryDate} />
            </div>
          ))}
          {newObs.map(m => (
            <div key={m.id} className="alert-card tone-watch">
              <span className="alert-ico">🔎</span>
              <div className="alert-body"><div className="t">{m.newIngredientName || m.menuName} 관찰 중</div><div className="d">{m.adverseFlag ? '이상반응 확인 필요' : '이상반응 없음'} · 3일 관찰</div></div>
              <span className="dday watch">관찰</span>
            </div>
          ))}
        </div>

        <div className="section">
          <button className="cook-cta" onClick={() => go('recipe')}>
            <div className="cook-cta__left"><div className="t">오늘 뭐 만들까?</div><div className="d">냉장고 재료로 추천받기</div></div>
            <span className="cook-cta__arrow"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
          </button>
        </div>
      </div>
    </section>
  );
}

// ── FRIDGE ──────────────────────────────────────────────────
function FridgeScreen({ active, app, setApp, showToast, openAdd }: { active: boolean; app: AppState; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void; openAdd: () => void }) {
  const [filter, setFilter] = useState<'all' | PantryKind>('all');
  const items = app.pantry.filter(p => filter === 'all' || p.kind === filter);
  function remove(id: string) {
    setApp(s => ({ ...s, pantry: s.pantry.filter(p => p.id !== id) }));
    fetch(`/api/pantry/${id}`, { method: 'DELETE' }).catch(console.error);
    showToast('삭제했어요');
  }
  return (
    <section className={`screen${active ? ' is-active' : ''}`}>
      <div className="screen-header">
        <div><div className="screen-title">냉장고</div><div className="screen-sub">가구 공용 재고 · {app.pantry.length}개 항목</div></div>
        <button className="round-add" onClick={openAdd} aria-label="재료 추가"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></button>
      </div>
      <div className="seg">
        {(['all', 'ingredient', 'cube', 'prepared'] as const).map(f => (
          <button key={f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>{f === 'all' ? '전체' : KIND_LABELS[f]}</button>
        ))}
      </div>
      <div className="fridge-list">
        {items.length === 0 ? <div className="empty-note">재고가 비어 있어요. + 로 추가해 주세요.</div> : items.map(p => (
          <div key={p.id} className="stock-card">
            <div className={`stock-emoji ${stockBg(p)}`}>{ingredientEmoji(p.name)}</div>
            <div className="stock-body">
              <div className="t">{p.name}{p.forBabyId ? <span className="for-baby">전용</span> : null}</div>
              <div className="d">
                {p.kind === 'cube' && p.cubeCount ? `${p.cubeCount}개${p.cubeVolumeMl ? ` × ${p.cubeVolumeMl}${p.cubeUnit || 'ml'}` : ''}` : (p.quantity ? `${p.quantity}${p.unit || ''}` : KIND_LABELS[p.kind])}
                {p.purchaseDate ? ` · ${p.purchaseDate.slice(5)} ${p.kind === 'cube' ? '소분' : '구매'}` : ''} · {STORAGE_LABELS[p.storage]}
              </div>
            </div>
            <Dday date={p.expiryDate} />
            <button className="stock-del" aria-label="삭제" onClick={() => remove(p.id)}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 5v6m4-6v6" /></svg>
            </button>
          </div>
        ))}
      </div>
      <p className="disclaimer">보관기한 기본값은 식약처·대한소아과학회 자료 기준(검증중)이며 직접 수정할 수 있어요.</p>
    </section>
  );
}

// ── RECIPE ──────────────────────────────────────────────────
function RecipeScreen({ active, baby, months, stage, app, showToast }: { active: boolean; baby: Baby | null; months: number | null; stage: Stage; app: AppState; showToast: (m: string) => void }) {
  const [mode, setMode] = useState<'stock_only' | 'buy_few' | 'fresh_shop'>('stock_only');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ reason: string; recipes: RecipeReco[] } | null>(null);
  const [fsQ, setFsQ] = useState('');
  const [fsLoading, setFsLoading] = useState(false);
  const [fsList, setFsList] = useState<FsRecipe[] | null>(null);
  const [fsExpand, setFsExpand] = useState<string | null>(null);

  async function searchFs() {
    setFsLoading(true); setFsList(null);
    try {
      const res = await fetch(`/api/foodsafety?q=${encodeURIComponent(fsQ.trim())}`);
      const data = await res.json();
      setFsList(data.recipes || []);
    } catch { showToast('레시피 검색 오류'); } finally { setFsLoading(false); }
  }

  const allowed = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(stage) + 1);
  const candidates = REF.filter(r => allowed.includes(r.allowed_stage) && !(r.forbidden_before_months && months != null && months < r.forbidden_before_months)).map(r => r.name);
  const pantryNames = Array.from(new Set(app.pantry.map(p => p.name)));
  const expiringSoon = app.pantry.filter(p => expiryStatus(p.expiryDate) === 'soon').map(p => p.name);
  const builtin = BUILTIN.filter(r => r.stage_tags.includes(stage));

  async function run(m: typeof mode) {
    setMode(m); setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/recipe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, stageLabel: STAGE_LABELS[stage], months, candidates, pantry: pantryNames, allergens: [], expiringSoon }) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error === 'PREMIUM_REQUIRED' ? '프리미엄 기능이에요' : (data.error || '추천 실패')); return; }
      setResult(data);
    } catch { showToast('추천 중 오류가 발생했어요'); } finally { setLoading(false); }
  }

  return (
    <section className={`screen${active ? ' is-active' : ''}`}>
      <div className="screen-header"><div><div className="screen-title">레시피</div><div className="screen-sub">{baby?.name} · 이유식 {STAGE_LABELS[stage]} 기준 추천</div></div></div>
      <div className="mode-cards">
        <button className={`mode-card${mode === 'stock_only' ? ' is-active' : ''}`} onClick={() => run('stock_only')}><span className="mode-ico bg-walk">🧺</span><span className="mode-t">있는 걸로 만들기</span><span className="mode-d">재고 매칭</span></button>
        <button className={`mode-card${mode === 'buy_few' ? ' is-active' : ''}`} onClick={() => run('buy_few')}><span className="mode-ico bg-feed">🛒</span><span className="mode-t">한두 가지만 더</span><span className="mode-d">부족 2개 이하</span></button>
        <button className={`mode-card${mode === 'fresh_shop' ? ' is-active' : ''}`} onClick={() => run('fresh_shop')}><span className="mode-ico bg-play">✨</span><span className="mode-t">새로 장보고</span><span className="mode-d">재고 무관</span></button>
      </div>
      <div className="reason-strip"><span>💡</span><p>{result?.reason || `${STAGE_LABELS[stage]} 단계 · 냉장고 재료 ${pantryNames.length}종 기준으로 추천해요.`}</p></div>

      <div className="section" style={{ marginTop: 4 }}>
        {loading && <div className="empty-note">🍳 레시피를 고르는 중…</div>}
        {result && result.recipes.map((r, i) => {
          const isNew = r.ingredients.some(ing => !pantryNames.includes(ing.name)) && r.missing.length > 0;
          return (
            <div key={i} className={`recipe-card${isNew ? ' recipe-card--new' : ''}`}>
              <div className="recipe-thumb bg-thumb-1">{ingredientEmoji(r.ingredients[0]?.name || '')}</div>
              <div className="recipe-info">
                <div className="recipe-badges"><span className="rb rb-stage">{STAGE_LABELS[stage]}</span>{r.missing.length === 0 ? <span className="rb rb-match">재고 100%</span> : <span className="rb rb-new">+{r.missing.length} 구매</span>}</div>
                <div className="recipe-title">{r.title}</div>
                <div className="recipe-meta">{r.ingredients.map(ing => `${ing.name}${pantryNames.includes(ing.name) ? ' ✓' : ''}`).join(' · ')}</div>
                <div className="recipe-nutri"><span>🔥 {r.nutrition.kcal}kcal</span><span>🥚 {r.nutrition.protein}g</span><span>🩸 {r.nutrition.ironMg}mg</span></div>
                {r.missing.length > 0 && <div className="new-warn">🛒 추가 구매: {r.missing.join(', ')}</div>}
                {r.steps.length > 0 && <ol className="recipe-steps">{r.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>}
              </div>
            </div>
          );
        })}
        {!result && !loading && builtin.map(r => (
          <div key={r.id} className="recipe-card">
            <div className="recipe-thumb bg-thumb-2">{ingredientEmoji(r.ingredients[0]?.name || '')}</div>
            <div className="recipe-info">
              <div className="recipe-badges"><span className="rb rb-stage">{STAGE_LABELS[stage]}</span><span className="rb rb-match">기본</span></div>
              <div className="recipe-title">{r.title}</div>
              <div className="recipe-meta">{r.texture} · {r.ingredients.map(i => i.name).join(', ')}</div>
              <div className="recipe-nutri"><span>🔥 {r.nutrition.kcal}kcal</span><span>🥚 {r.nutrition.protein}g</span><span>🩸 {r.nutrition.ironMg}mg</span></div>
            </div>
          </div>
        ))}
      </div>
      <p className="disclaimer">단계·알레르기에 맞지 않는 재료는 추천에서 자동 제외돼요. 소아과 상담을 권해요.</p>

      <div className="section">
        <div className="section-head"><h3 className="h3">레시피 찾아보기</h3><span className="more">식약처 레시피 DB</span></div>
        <div className="fs-search">
          <input value={fsQ} onChange={e => setFsQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchFs()} placeholder="예: 두부, 애호박, 미음…" />
          <button className="btn-orange" onClick={searchFs}>검색</button>
        </div>
        {fsLoading && <div className="empty-note">레시피를 찾는 중…</div>}
        {fsList && fsList.length === 0 && <div className="empty-note">결과가 없어요. (전체 검색은 API 키 발급 후 가능)</div>}
        {fsList && fsList.map(r => (
          <div key={r.id} className="recipe-card" style={{ flexDirection: 'column', gap: 10 }} onClick={() => setFsExpand(fsExpand === r.id ? null : r.id)}>
            <div style={{ display: 'flex', gap: 14 }}>
              {r.image ? <img src={r.image} alt="" className="recipe-thumb" style={{ objectFit: 'cover' }} /> : <div className="recipe-thumb bg-thumb-3">🍽️</div>}
              <div className="recipe-info">
                <div className="recipe-badges"><span className="rb rb-stage">{r.category || '요리'}</span>{r.way && <span className="rb rb-match">{r.way}</span>}</div>
                <div className="recipe-title">{r.name}</div>
                <div className="recipe-meta">{r.ingredients.slice(0, 48)}{r.ingredients.length > 48 ? '…' : ''}</div>
                {(r.nutrition.kcal || r.nutrition.protein) && <div className="recipe-nutri">{r.nutrition.kcal && <span>🔥 {r.nutrition.kcal}kcal</span>}{r.nutrition.protein && <span>🥚 {r.nutrition.protein}g</span>}</div>}
              </div>
            </div>
            {fsExpand === r.id && r.steps.length > 0 && <ol className="recipe-steps">{r.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>}
          </div>
        ))}
        <p className="disclaimer">출처: 식품의약품안전처 조리식품 레시피 DB(이용허락 제한 없음). 아기 이유식용은 단계·알레르기에 맞게 재료를 조정하세요.</p>
      </div>
    </section>
  );
}

// ── MEAL LOG ────────────────────────────────────────────────
function LogScreen({ active, app, openAdd }: { active: boolean; app: AppState; openAdd: () => void }) {
  const [tab, setTab] = useState<'timeline' | 'album'>('timeline');
  const events = [
    ...app.feedingLogs.map(f => ({ kind: 'feed' as const, date: f.date, time: f.time, id: f.id, ttl: `${f.feedType || '수유'}`, sub: '아기의 기록 연동', amt: f.amount ? `${f.amount}ml` : '', isNew: false })),
    ...app.mealLogs.map(m => {
      const intake = m.beforeMl != null && m.afterMl != null ? Math.max(0, m.beforeMl - m.afterMl) : null;
      return { kind: 'solid' as const, date: m.date || '', time: m.time, id: m.id, ttl: `${m.menuName || '이유식'} ${ingredientEmoji(m.menuName)}`, sub: `이유식${m.intakeRatio ? ` · ${INTAKE_LABELS[m.intakeRatio]}` : ''}${m.adverseFlag ? ' · ⚠️이상반응' : ''}`, amt: intake != null ? `${intake}ml` : (m.reaction || ''), isNew: m.isNewIngredient };
    }),
  ].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  const byDate = events.reduce<Record<string, typeof events>>((acc, e) => { (acc[e.date] ||= []).push(e); return acc; }, {});
  const introduced = Array.from(new Set(app.mealLogs.filter(m => m.newIngredientName).map(m => m.newIngredientName)));

  return (
    <section className={`screen${active ? ' is-active' : ''}`}>
      <div className="screen-header">
        <div><div className="screen-title">식사기록</div><div className="screen-sub">수유와 이유식을 한 흐름으로</div></div>
        <button className="round-add" onClick={openAdd} aria-label="기록 추가"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></button>
      </div>
      <div className="seg">
        <button className={tab === 'timeline' ? 'is-active' : ''} onClick={() => setTab('timeline')}>타임라인</button>
        <button className={tab === 'album' ? 'is-active' : ''} onClick={() => setTab('album')}>사진첩</button>
      </div>
      {tab === 'timeline' ? (
        <div className="log-pane">
          {events.length === 0 && <div className="empty-note">아직 기록이 없어요. + 로 추가해 주세요.</div>}
          {Object.entries(byDate).map(([date, evs]) => (
            <div key={date}>
              <div className="log-date"><span className="day">{date === todayStr() ? '오늘' : date}</span></div>
              <div className="tl-list">
                {evs.map(e => (
                  <div key={e.kind + e.id} className={`tl-event${e.kind === 'feed' ? ' tl-event--milk' : ''}`}>
                    <div className="time">{e.time || ''}</div>
                    <div className="dot-wrap"><span className={`e-dot ${e.kind === 'feed' ? 'feed' : 'solid'}`} /></div>
                    <div><div className="ttl">{e.ttl}{e.isNew && <span className="new-chip">새 재료</span>}</div><div className="sub">{e.sub}</div></div>
                    <span className={`amt${e.kind === 'feed' ? ' amt--milk' : ''}`}>{e.amt}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {introduced.length > 0 && (
            <div className="ingredient-history">
              <div className="section-head"><h3 className="h3">도입한 재료</h3></div>
              <div className="chip-flow">{introduced.map(n => <span key={n} className="ing-chip ok">{n} ✓</span>)}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="log-pane">
          <div className="empty-note">끼니 사진 기능은 준비 중이에요. 곧 성장 기록·진료 리포트에 함께 담을 수 있어요.</div>
        </div>
      )}
    </section>
  );
}

// ── BABY ────────────────────────────────────────────────────
const DEV_ITEMS = [
  { id: 'neck', t: '목을 잘 가눠요', d: '혼자 고개를 안정적으로 지탱' },
  { id: 'tongue', t: '혀 밀어내기 반사가 사라졌어요', d: '숟가락을 밀어내지 않음' },
  { id: 'interest', t: '음식에 관심을 보여요', d: '어른이 먹을 때 입을 오물거림' },
  { id: 'sit', t: '지지하면 앉을 수 있어요', d: '중기 이유식 진입 신호' },
];

function BabyScreen({ active, baby, babies, months, stage, growth, setApp, showToast, setActiveBabyId }: { active: boolean; baby: Baby | null; babies: Baby[]; months: number | null; stage: Stage; growth: Growth[]; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void; setActiveBabyId: (id: number) => void }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [growthSheet, setGrowthSheet] = useState(false);
  const done = Object.values(checks).filter(Boolean).length;

  return (
    <section className={`screen${active ? ' is-active' : ''}`}>
      <div className="screen-header"><div><div className="screen-title">아기</div><div className="screen-sub">발육 · 발달 · 섭취 평가</div></div>
        <button className="round-add gear" onClick={() => signOut()} aria-label="설정"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 17l5-5-5-5M21 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7" /></svg></button>
      </div>

      <div className="baby-profile">
        <div className="baby-profile__face">{baby?.gender === 'boy' ? '👦' : '👧'}</div>
        <div className="baby-profile__info"><div className="name">{baby?.name}</div><div className="sub">{baby?.birth_date} 출생 · {months != null ? `${months}개월` : ''}</div></div>
        {baby?.share_code
          ? <span className="share-btn">{baby.share_code}</span>
          : babies.length > 1 && <span className="share-btn" onClick={() => { }}>공유코드</span>}
      </div>

      {babies.length > 1 && (
        <div className="baby-section">
          <div className="section-head"><h3 className="h3">아기 전환</h3></div>
          <div className="chip-flow">{babies.map(b => <span key={b.id} className={`ing-chip${b.id === baby?.id ? ' ok' : ''}`} onClick={() => setActiveBabyId(b.id)}>{b.name}</span>)}</div>
        </div>
      )}

      <GrowthSection gender={baby?.gender || 'girl'} months={months} birthDate={baby?.birth_date || ''} growth={growth} onAdd={() => setGrowthSheet(true)} />

      <div className="baby-section">
        <div className="section-head"><h3 className="h3">발달 체크 · 이유식 준비</h3></div>
        <div className="dev-list">
          {DEV_ITEMS.map(it => (
            <label key={it.id} className={`dev-check${checks[it.id] ? ' is-done' : ''}`} onClick={() => setChecks(c => ({ ...c, [it.id]: !c[it.id] }))}>
              <span className={`checkbox${checks[it.id] ? ' is-checked' : ''}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></span>
              <span className="dev-txt"><b>{it.t}</b><i>{it.d}</i></span>
            </label>
          ))}
        </div>
        <div className="stage-verdict">
          <div className="sv-badge">{STAGE_LABELS[stage]}</div>
          <div className="sv-body"><div className="t">지금은 이유식 {STAGE_LABELS[stage]}예요</div><div className="d">{DEV_ITEMS.length}개 중 {done}개 충족 · 월령 기준 권장 단계예요. 단계 전환은 소아과 상담을 함께 권해요.</div></div>
        </div>
      </div>

      <div className="baby-section">
        <div className="section-head"><h3 className="h3">섭취 적정성 평가</h3></div>
        <div className="assess-card">
          <div className="empty-note" style={{ padding: '8px 0 12px' }}>수유량과 이유식 섭취가 쌓이면 주간 적정성·유즙/이유식 비율을 평가해 드려요. (평가 모듈 준비중)</div>
          <p className="assess-guard">추정치를 포함한 참고 정보예요. 정확한 판단은 소아과 상담을 권해요.</p>
        </div>
      </div>

      {growthSheet && baby && <GrowthSheet babyId={baby.id} onClose={() => setGrowthSheet(false)} setApp={setApp} showToast={showToast} />}
    </section>
  );
}

function GrowthSection({ gender, months, birthDate, growth, onAdd }: { gender: 'boy' | 'girl'; months: number | null; birthDate: string; growth: Growth[]; onAdd: () => void }) {
  const [metric, setMetric] = useState<Metric>('height');
  const latest = growth.length ? growth[growth.length - 1] : null;
  const mo = months;
  const wPct = latest?.weight != null && mo != null ? percentileFor('weight', gender, mo, latest.weight) : null;
  const hPct = latest?.height != null && mo != null ? percentileFor('height', gender, mo, latest.height) : null;
  const comment = nutritionComment(wPct?.pct ?? null, hPct?.pct ?? null);
  const toneCls = comment.tone === 'warn' ? 'tone-warn' : comment.tone === 'watch' ? 'tone-watch' : '';

  return (
    <div className="baby-section">
      <div className="section-head"><h3 className="h3">성장 기록</h3><span className="more" onClick={onAdd}>기록 추가 ›</span></div>
      {!latest ? (
        <div className="growth-card"><div className="empty-note" style={{ padding: '10px 0' }}>키·몸무게를 입력하면 정상 백분위 중 어디에 있는지 그래프로 보여드려요.</div></div>
      ) : (
        <>
          <div className="growth-card">
            <MetricRow label="몸무게" unit="kg" value={latest.weight} pct={wPct} />
            <div style={{ height: 12 }} />
            <MetricRow label="키" unit="cm" value={latest.height} pct={hPct} />
            <div className="growth-foot">WHO 성장도표 P3~P97 기준 · {latest.date} 측정{mo != null ? ` · ${mo}개월` : ''}</div>
          </div>
          <div className="growth-card" style={{ marginTop: 8 }}>
            <div className="seg" style={{ margin: '0 0 12px' }}>
              <button className={metric === 'height' ? 'is-active' : ''} onClick={() => setMetric('height')}>키(cm)</button>
              <button className={metric === 'weight' ? 'is-active' : ''} onClick={() => setMetric('weight')}>몸무게(kg)</button>
            </div>
            <GrowthChart metric={metric} gender={gender} birthDate={birthDate} growth={growth} />
            <div className="growth-legend"><span><i className="lg-band" />정상범위(P3~P97)</span><span><i className="lg-p50" />중앙값(P50)</span><span><i className="lg-me" />우리 아기</span></div>
          </div>
          <div className={`alert-card ${toneCls}`} style={{ marginTop: 8 }}>
            <span className="alert-ico">{comment.tone === 'warn' ? '⚠️' : comment.tone === 'watch' ? '🟡' : '🟢'}</span>
            <div className="alert-body"><div className="t">영양 코멘트</div><div className="d" style={{ marginTop: 3, lineHeight: 1.5 }}>{comment.text}</div></div>
          </div>
        </>
      )}
    </div>
  );
}

function GrowthChart({ metric, gender, birthDate, growth }: { metric: Metric; gender: 'boy' | 'girl'; birthDate: string; growth: Growth[] }) {
  const W = 300, H = 190, padL = 30, padR = 10, padT = 10, padB = 22;
  const band = GROWTH_DATA[gender][metric];
  const maxM = 24;
  const minV = band.P3[0], maxV = band.P97[maxM];
  const x = (m: number) => padL + (Math.max(0, Math.min(maxM, m)) / maxM) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - minV) / (maxV - minV)) * (H - padT - padB);
  const line = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaTop = band.P97.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaBot = [...band.P3].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const pts = growth
    .filter(g => (metric === 'height' ? g.height : g.weight) != null && birthDate)
    .map(g => ({ m: monthsBetween(birthDate, g.date), v: (metric === 'height' ? g.height : g.weight) as number }))
    .filter(p => p.m <= maxM)
    .sort((a, b) => a.m - b.m);
  const yTicks = 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* y grid + labels */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const v = minV + (maxV - minV) * (i / yTicks); const yy = y(v);
        return <g key={i}><line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--line)" strokeWidth="1" /><text x={padL - 4} y={yy + 3} textAnchor="end" fontSize="8" fill="var(--ink-4)">{Math.round(v)}</text></g>;
      })}
      {/* x labels (months) */}
      {[0, 6, 12, 18, 24].map(m => <text key={m} x={x(m)} y={H - 8} textAnchor="middle" fontSize="8" fill="var(--ink-4)">{m}개월</text>)}
      {/* normal band */}
      <path d={`${areaTop} ${areaBot} Z`} fill="var(--green-100)" opacity="0.5" />
      <path d={line(band.P3)} fill="none" stroke="var(--green-300)" strokeWidth="1" strokeDasharray="2 2" />
      <path d={line(band.P97)} fill="none" stroke="var(--green-300)" strokeWidth="1" strokeDasharray="2 2" />
      <path d={line(band.P50)} fill="none" stroke="var(--green-400)" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* baby line + points */}
      {pts.length > 1 && <path d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.m).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} fill="none" stroke="var(--orange-500)" strokeWidth="2" />}
      {pts.map((p, i) => <circle key={i} cx={x(p.m)} cy={y(p.v)} r="3.2" fill="var(--orange-500)" stroke="#fff" strokeWidth="1.5" />)}
    </svg>
  );
}

function MetricRow({ label, unit, value, pct }: { label: string; unit: string; value: number | null; pct: PctResult | null }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div className="gm-lbl">{label}</div>
        {pct && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange-500)' }}>{Math.round(pct.pct)}백분위 · {rankLabel(pct.pct)}</div>}
      </div>
      <div className="gm-val" style={{ margin: '2px 0 6px' }}>{value ?? '—'}<span>{unit}</span></div>
      {pct && (
        <>
          <div className="pct-track"><span className="pct-marker" style={{ left: `${pct.pos}%` }} /></div>
          <div className="pct-scale"><span>P3 {pct.band.p3}</span><span>P50 {pct.band.p50}</span><span>P97 {pct.band.p97}</span></div>
        </>
      )}
    </div>
  );
}

function GrowthSheet({ babyId, onClose, setApp, showToast }: { babyId: number; onClose: () => void; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void }) {
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  function save() {
    if (!weight && !height) { showToast('키나 몸무게를 입력해 주세요'); return; }
    const rec: Growth = { id: uid(), date, weight: weight ? Number(weight) : null, height: height ? Number(height) : null };
    setApp(s => ({ ...s, growth: [...s.growth, rec].sort((a, b) => a.date.localeCompare(b.date)) }));
    fetch('/api/growth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rec, babyId }) }).catch(console.error);
    showToast('성장 기록을 저장했어요'); onClose();
  }
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h3>성장 기록 추가</h3>
        <div className="field"><label>측정일</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field" style={{ flex: 1 }}><label>몸무게 (kg)</label><input type="number" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="6.8" /></div>
          <div className="field" style={{ flex: 1 }}><label>키 (cm)</label><input type="number" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder="63" /></div>
        </div>
        <button className="btn-orange btn-full" onClick={save}>저장하기</button>
      </div>
    </div>
  );
}

// ── SHEETS ──────────────────────────────────────────────────
function PantrySheet({ onClose, setApp, showToast, initial }: { onClose: () => void; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void; initial?: Partial<PantryItem> }) {
  const [kind, setKind] = useState<PantryKind>(initial?.kind || 'ingredient');
  const [name, setName] = useState(initial?.name || '');
  const [cat, setCat] = useState<string>(initial?.category || '채소');
  const [storage, setStorage] = useState<Storage>(initial?.storage || 'fridge');
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate || todayStr());
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate || '');
  const [cubeCount, setCubeCount] = useState(initial?.cubeCount ? String(initial.cubeCount) : '');
  const [cubeVolume, setCubeVolume] = useState(initial?.cubeVolumeMl ? String(initial.cubeVolumeMl) : '');
  const [cubeUnit, setCubeUnit] = useState(initial?.cubeUnit || 'ml');

  function applyExpiry(nm: string, st: Storage) {
    const r = REF.find(x => x.name === nm);
    const days = r?.default_expiry_days?.[st];
    if (days != null) { const d = new Date(); d.setDate(d.getDate() + days); setExpiryDate(d.toISOString().slice(0, 10)); }
  }
  function pick(r: IngredientRef) { setName(r.name); setCat(r.category); applyExpiry(r.name, storage); }
  function save() {
    if (!name.trim()) { showToast('재료명을 입력해 주세요'); return; }
    const item: PantryItem = { id: uid(), kind, name: name.trim(), category: REF.find(r => r.name === name.trim())?.category || cat, storage,
      quantity: null, unit: null, cubeCount: cubeCount ? Number(cubeCount) : null, cubeVolumeMl: cubeVolume ? Number(cubeVolume) : null, cubeUnit,
      recipeRef: null, purchaseDate: purchaseDate || null, openDate: null, cookedDate: null, expiryDate: expiryDate || null, forBabyId: null, note: '' };
    setApp(s => ({ ...s, pantry: [item, ...s.pantry] }));
    fetch('/api/pantry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }).catch(console.error);
    showToast('재료를 추가했어요'); onClose();
  }
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h3>재료 추가</h3>
        <div className="field"><label>종류</label><div className="chips-row">{(['ingredient', 'cube', 'prepared'] as PantryKind[]).map(k => <button key={k} className={`chip-pick${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{KIND_LABELS[k]}</button>)}</div></div>

        <div className="field"><label>카테고리에서 빠르게 선택</label>
          <div className="chips-row" style={{ marginBottom: 8 }}>{CATS.map(c => <button key={c} className={`chip-pick${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
          <div className="chips-row">{(BY_CAT[cat] || []).map(r => <button key={r.name} className={`chip-pick${name === r.name ? ' on' : ''}`} onClick={() => pick(r)}>{ingredientEmoji(r.name)} {r.name}</button>)}</div>
        </div>

        <div className="field"><label>이름 (없으면 직접 입력)</label><input value={name} onChange={e => setName(e.target.value)} onBlur={() => applyExpiry(name, storage)} placeholder="예: 애호박" /></div>
        <div className="field"><label>보관</label><div className="chips-row">{STORAGE_ORDER.map(s => <button key={s} className={`chip-pick${storage === s ? ' on' : ''}`} onClick={() => { setStorage(s); applyExpiry(name, s); }}>{STORAGE_LABELS[s]}</button>)}</div></div>
        {kind === 'cube' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}><label>큐브 수</label><input type="number" value={cubeCount} onChange={e => setCubeCount(e.target.value)} placeholder="6" /></div>
            <div className="field" style={{ flex: 1 }}><label>1개 용량</label><input type="number" value={cubeVolume} onChange={e => setCubeVolume(e.target.value)} placeholder="30" /></div>
            <div className="field" style={{ width: 92 }}><label>단위</label><div className="chips-row">{(['ml', 'g'] as const).map(u => <button key={u} className={`chip-pick${cubeUnit === u ? ' on' : ''}`} onClick={() => setCubeUnit(u)}>{u}</button>)}</div></div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}><div className="field" style={{ flex: 1 }}><label>{kind === 'cube' ? '소분일' : '구매일'}</label><input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div><div className="field" style={{ flex: 1 }}><label>소진기한</label><input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></div></div>
        <button className="btn-orange btn-full" onClick={save}>추가하기</button>
      </div>
    </div>
  );
}

function MealSheet({ babyId, onClose, setApp, showToast }: { babyId: number; onClose: () => void; setApp: React.Dispatch<React.SetStateAction<AppState>>; showToast: (m: string) => void }) {
  const [menuName, setMenuName] = useState('');
  const [intakeRatio, setIntakeRatio] = useState<IntakeRatio>('all');
  const [reaction, setReaction] = useState('');
  const [adverseFlag, setAdverseFlag] = useState(false);
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const beforeN = before === '' ? null : Number(before);
  const afterN = after === '' ? null : Number(after);
  const intakeMl = beforeN != null && afterN != null ? Math.max(0, beforeN - afterN) : null;
  // 눈금 입력이 있으면 섭취 비율 자동 판정
  const autoRatio: IntakeRatio | null = (intakeMl != null && beforeN) ? (() => {
    const r = intakeMl / beforeN;
    return r >= 0.9 ? 'all' : r >= 0.4 ? 'half' : r > 0 ? 'little' : 'refused';
  })() : null;
  function save() {
    if (!menuName.trim()) { showToast('메뉴를 입력해 주세요'); return; }
    const m: MealLog = { id: uid(), babyId, date: todayStr(), time, menuName: menuName.trim(), recipeRef: null, intakeRatio: autoRatio || intakeRatio, estimatedKcal: null, reaction: reaction.trim(), adverseFlag, adverseNote: '', isNewIngredient: false, newIngredientName: '', beforeMl: beforeN, afterMl: afterN };
    setApp(s => ({ ...s, mealLogs: [m, ...s.mealLogs] }));
    fetch('/api/meal-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }).catch(console.error);
    showToast('식사를 기록했어요'); onClose();
  }
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h3>이유식 기록</h3>
        <div className="field"><label>메뉴</label><input value={menuName} onChange={e => setMenuName(e.target.value)} placeholder="예: 소고기 애호박죽" /></div>
        <div className="field"><label>눈금으로 먹은 양 계산 (선택)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" inputMode="numeric" value={before} onChange={e => setBefore(e.target.value)} placeholder="식사 전 ml" />
            <input type="number" inputMode="numeric" value={after} onChange={e => setAfter(e.target.value)} placeholder="남긴 양 ml" />
          </div>
          {intakeMl != null && <div className="intake-calc">🍽 먹은 양 <b>{intakeMl}ml</b>{autoRatio ? ` · ${INTAKE_LABELS[autoRatio]}` : ''}</div>}
        </div>
        {intakeMl == null && <div className="field"><label>섭취량</label><div className="chips-row">{(['all', 'half', 'little', 'refused'] as IntakeRatio[]).map(r => <button key={r} className={`chip-pick${intakeRatio === r ? ' on' : ''}`} onClick={() => setIntakeRatio(r)}>{INTAKE_LABELS[r]}</button>)}</div></div>}
        <div className="field"><label>반응 메모</label><textarea value={reaction} onChange={e => setReaction(e.target.value)} placeholder="잘 먹었어요 / 입에 안 맞아 했어요" /></div>
        <div className="field"><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={adverseFlag} onChange={e => setAdverseFlag(e.target.checked)} style={{ width: 'auto' }} />이상반응(발진·구토·설사 등)이 있었어요</label></div>
        <button className="btn-orange btn-full" onClick={save}>기록하기</button>
      </div>
    </div>
  );
}

function BabySwitchSheet({ babies, activeId, onPick, onClose }: { babies: Baby[]; activeId: number | null; onPick: (id: number) => void; onClose: () => void }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h3>아기 선택</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {babies.map(b => (
            <button key={b.id} className={`chip-pick${b.id === activeId ? ' on' : ''}`} style={{ textAlign: 'left', padding: '12px 14px' }} onClick={() => onPick(b.id)}>
              {b.gender === 'boy' ? '👦' : '👧'} {b.name} · {getAgeMonths(b.birth_date)}개월
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

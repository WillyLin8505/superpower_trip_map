/**
 * Crowd-data spike PoC — 子專案 #9 / 需求 4
 * ------------------------------------------------------------
 * 獨立檔案，未接進主程式（不 import 任何核心碼，核心碼也不 import 它）。
 * 對應：docs/superpowers/spikes/2026-06-28-crowd-data-findings.md
 *
 * 跑法：
 *   Part B（零相依，現在就能跑）：
 *     npx tsx docs/superpowers/spikes/crowd-poc.ts
 *   Part A（需免費 key）：
 *     BESTTIME_PRIVATE_KEY=xxx npx tsx docs/superpowers/spikes/crowd-poc.ts --besttime
 *
 * 註：Part A 會對「單一地點」呼叫 BestTime 一次 POST /forecasts，
 *     把原始回應印出來當佐證。沒給 key 時自動略過。
 */

type CrowdLevel = 'low' | 'medium' | 'high' | 'closed';

// ============================================================
// Part A — BestTime.app PoC（需要 BESTTIME_PRIVATE_KEY）
// 文件：https://documentation.besttime.app/
// 模型：先 POST 建 forecast（by name+address）→ 回應內含整週 0–100% 分析。
// ============================================================
async function bestTimePoc(): Promise<void> {
  const key = process.env.BESTTIME_PRIVATE_KEY;
  if (!key) {
    console.log('[Part A] 略過：未設定 BESTTIME_PRIVATE_KEY（去 besttime.app 申請免費測試 key）。');
    return;
  }

  // 範例：換成你要驗證的真實台/日/韓地點
  const venueName = '鼎泰豐 信義店';
  const venueAddress = 'No. 194, Section 2, Xinyi Rd, Da’an District, Taipei City, Taiwan';

  const url =
    'https://besttime.app/api/v1/forecasts' +
    `?api_key_private=${encodeURIComponent(key)}` +
    `&venue_name=${encodeURIComponent(venueName)}` +
    `&venue_address=${encodeURIComponent(venueAddress)}`;

  console.log(`[Part A] POST forecast: ${venueName}`);
  const res = await fetch(url, { method: 'POST' });
  const json = await res.json();

  console.log(`[Part A] HTTP ${res.status}`);
  // 把原始回應貼進 findings.md 當佐證；analysis.week_raw = 7×24 的 0–100 值
  console.log(JSON.stringify(json, null, 2).slice(0, 4000));

  // 命中率判讀：status === 'OK' 且有 analysis 即代表該地點有資料
  const ok = json?.status === 'OK' && !!json?.analysis;
  console.log(`[Part A] 覆蓋率命中：${ok ? '✅ 有資料' : '❌ 無資料 / 量不足'}`);
}

// ============================================================
// Part B — 決定性啟發式 PoC（零相依，fallback 證明可行）
// 輸入訊號：place_types、user_ratings_total、rating、營業時間、時段。
// 輸出：整週每小時 低/普通/多（方向性，非量化）。
// ============================================================

/** place_type → 7×24 相對乘數（0..1）。可編輯常數，非魔法。週一=0 … 週日=6 */
type WeeklyCurve = number[][]; // [day0..6][hour0..23]

function flat(value: number): WeeklyCurve {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => value));
}

/** 餐廳：午(11–13)晚(17–20)雙峰，週末略高 */
function restaurantCurve(): WeeklyCurve {
  const base = flat(0.15);
  for (let d = 0; d < 7; d++) {
    const weekendBoost = d >= 5 ? 1.15 : 1.0;
    for (const [h, v] of [[11, 0.6], [12, 0.95], [13, 0.7], [17, 0.55], [18, 0.9], [19, 1.0], [20, 0.75]] as const) {
      base[d][h] = Math.min(1, v * weekendBoost);
    }
  }
  return base;
}

/** 景點 / 公園：週末白天高峰 */
function attractionCurve(): WeeklyCurve {
  const base = flat(0.2);
  for (let d = 0; d < 7; d++) {
    const weekend = d >= 5;
    for (let h = 10; h <= 16; h++) base[d][h] = weekend ? 0.95 : 0.55;
  }
  return base;
}

const CURVES: Record<string, WeeklyCurve> = {
  restaurant: restaurantCurve(),
  cafe: restaurantCurve(),
  tourist_attraction: attractionCurve(),
  museum: attractionCurve(),
  park: attractionCurve(),
};

interface HeuristicInput {
  name: string;
  placeTypes: string[];
  userRatingsTotal: number;
  rating?: number;
  /** 每天營業 [openHour, closeHour)；缺省視為全天開 */
  openHours?: [number, number];
}

function basePopularity(reviews: number): number {
  // log 壓縮：50k 評論 → 高基底；80 評論 → 低基底
  return Math.max(0, Math.min(1, Math.log10(reviews + 1) / 4.5));
}

function bucket(score: number): CrowdLevel {
  if (score >= 0.55) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

function estimateWeek(input: HeuristicInput): CrowdLevel[][] {
  const pop = basePopularity(input.userRatingsTotal);
  const type = input.placeTypes.find((t) => t in CURVES) ?? 'tourist_attraction';
  const curve = CURVES[type];
  const [open, close] = input.openHours ?? [0, 24];

  return Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => {
      if (h < open || h >= close) return 'closed';
      const ratingNudge = input.rating ? 1 + (input.rating - 4) * 0.05 : 1; // 4.0 為中性
      return bucket(pop * curve[d][h] * ratingNudge);
    }),
  );
}

function heuristicPoc(): void {
  const samples: HeuristicInput[] = [
    { name: '鼎泰豐 信義店（熱門餐廳）', placeTypes: ['restaurant'], userRatingsTotal: 42000, rating: 4.4, openHours: [11, 21] },
    { name: '某巷弄小店（冷門餐廳）', placeTypes: ['restaurant'], userRatingsTotal: 90, rating: 4.6, openHours: [11, 20] },
    { name: '國立故宮博物院（景點）', placeTypes: ['museum', 'tourist_attraction'], userRatingsTotal: 65000, rating: 4.5, openHours: [9, 17] },
  ];

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const s of samples) {
    const week = estimateWeek(s);
    console.log(`\n[Part B] ${s.name}  (reviews=${s.userRatingsTotal}, rating=${s.rating ?? '—'})`);
    for (let d = 0; d < 7; d++) {
      // 只印幾個代表小時：12（午）、15（午後）、19（晚）
      const pick = [12, 15, 19].map((h) => `${h}:00=${week[d][h]}`).join('  ');
      console.log(`  ${days[d]}  ${pick}`);
    }
  }
  console.log('\n[Part B] 說明：以上為「預估」（方向性），UI 必須標示為估計、非真實人潮資料。');
}

// ============================================================
async function main() {
  const wantBestTime = process.argv.includes('--besttime');
  console.log('=== Crowd-data spike PoC ===');
  heuristicPoc(); // Part B 一定跑（零相依）
  if (wantBestTime) await bestTimePoc();
  else console.log('\n[Part A] 加 --besttime 並設定 BESTTIME_PRIVATE_KEY 可實打 BestTime。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export { estimateWeek, basePopularity, type CrowdLevel, type HeuristicInput };

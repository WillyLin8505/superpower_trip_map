/**
 * 住宿排程 spike PoC — 子專案 #3 / 需求 10
 * ------------------------------------------------------------
 * 獨立檔，零相依、未接進主程式。驗證 Approach B：
 *   決定性「容量感知就近分群」+ 端點固定 2-opt。
 * 對應：docs/superpowers/specs/2026-06-28-accommodation-scheduling-design.md
 *
 * 跑法：  npx tsx docs/superpowers/spikes/accommodation-poc.ts
 *   （或 node 跑轉譯後版本；本檔為純 TS，無 import）
 */

interface Pt { name: string; lat: number; lng: number; dwellMin?: number }

// ---- haversine（簡化內嵌版；步行 1.4 m/s，回傳秒）----
function haversineSec(a: Pt, b: Pt): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dφ = toRad(b.lat - a.lat);
  const dλ = toRad(b.lng - a.lng);
  const x = Math.sin(dφ / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dλ / 2) ** 2;
  const m = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Math.round(m / 1.4);
}

// ---- nearest-neighbor + 2-opt（端點自由，用於排飯店夜序）----
function buildMatrix(pts: Pt[]): number[][] {
  return pts.map((a) => pts.map((b) => haversineSec(a, b)));
}
function routeCost(r: number[], m: number[][]): number {
  let c = 0; for (let i = 0; i < r.length - 1; i++) c += m[r[i]][r[i + 1]]; return c;
}
function nearestNeighbor(m: number[][], start = 0): number[] {
  const n = m.length, visited = new Set([start]), route = [start];
  let cur = start;
  while (visited.size < n) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < n; j++) if (!visited.has(j) && m[cur][j] < bd) { best = j; bd = m[cur][j]; }
    visited.add(best); route.push(best); cur = best;
  }
  return route;
}
function twoOpt(route: number[], m: number[][], fixEnd = false): number[] {
  let best = [...route], improved = true;
  const lastMovable = fixEnd ? best.length - 2 : best.length - 1; // fixEnd: 不動最後一個
  while (improved) {
    improved = false;
    for (let i = 1; i <= lastMovable; i++) {
      for (let j = i + 1; j <= lastMovable; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        if (routeCost(cand, m) < routeCost(best, m)) { best = cand; improved = true; }
      }
    }
  }
  return best;
}

// ---- Approach B 核心：容量感知就近分群 ----
const DAY_BUDGET_MIN = 480; // 一天可玩 8 小時（含景點停留，不含交通；住宿不計）
const DEFAULT_DWELL = 90;   // 景點預設停留

function centroid(pts: Pt[]): Pt {
  const n = pts.length;
  return { name: 'centroid', lat: pts.reduce((s, p) => s + p.lat, 0) / n, lng: pts.reduce((s, p) => s + p.lng, 0) / n };
}

/** 1) 排飯店夜序：種子=離景點重心最近的飯店，再 NN+2-opt 串鏈 */
function inferNightOrder(hotels: Pt[], attractions: Pt[]): number[] {
  const c = centroid(attractions);
  let seed = 0, sd = Infinity;
  hotels.forEach((h, i) => { const d = haversineSec(h, c); if (d < sd) { sd = d; seed = i; } });
  const m = buildMatrix(hotels);
  return twoOpt(nearestNeighbor(m, seed), m); // 夜序（hotels 索引序列）
}

/**
 * 2) 就近 home-night + 累進填滿（優先排滿前面的天，塞不下才往後溢，不平分）
 *
 * - 先把每個景點歸到「最近的那一夜」(home night) → 保住地理性。
 * - 依夜序 1→N 逐天處理：當天景點依「離當晚飯店距離」近→遠排隊，
 *   逐一塞入；若塞下去會超過當天預算，就把該景點 cascade 到下一夜
 *   （往後溢，不回頭平衡）。
 * - 最後一夜承接所有剩餘（可能超預算 → 之後以 outsideHours/lateExit 警告）。
 */
function clusterFillForward(attractions: Pt[], nightHotels: Pt[]): number[][] {
  const K = nightHotels.length;
  // home night = 離哪一夜飯店最近
  const groups: number[][] = Array.from({ length: K }, () => []);
  attractions.forEach((a, idx) => {
    let home = 0, hd = Infinity;
    nightHotels.forEach((h, n) => { const d = haversineSec(a, h); if (d < hd) { hd = d; home = n; } });
    groups[home].push(idx);
  });

  const buckets: number[][] = Array.from({ length: K }, () => []);
  const load = new Array(K).fill(0);

  for (let k = 0; k < K; k++) {
    // 當天隊伍（含上一夜 cascade 進來的）依「離當晚飯店」近→遠排序，平手用 name
    const queue = groups[k]
      .map((idx) => ({ idx, d: haversineSec(attractions[idx], nightHotels[k]) }))
      .sort((p, q) => (p.d - q.d) || attractions[p.idx].name.localeCompare(attractions[q.idx].name));

    for (const { idx } of queue) {
      const dwell = attractions[idx].dwellMin ?? DEFAULT_DWELL;
      const isLastNight = k === K - 1;
      if (!isLastNight && load[k] + dwell > DAY_BUDGET_MIN) {
        groups[k + 1].push(idx); // 塞不下 → 往後溢一天
      } else {
        buckets[k].push(idx);
        load[k] += dwell;        // 最後一夜不擋，全收（可能超預算）
      }
    }
  }
  return buckets;
}

/**
 * 3) 每天端點固定排序：起=昨晚飯店(pos0 釘死), 終=今晚飯店(最後釘死), 中間=當天景點。
 *
 * ⚠ 關鍵 landmine（PoC 第一版踩到）：不能直接對 [start,...attr,end] 跑
 * nearestNeighbor —— NN 會把 end 節點重排到中間，之後的 fixEnd 2-opt 只會
 * 釘住「NN 排完後剛好在最後的那個節點」，不一定是 end 飯店。
 * 正解：先把 start/end 抽出來「釘」在頭尾，NN/2-opt 只作用在中間景點。
 */
function routeDay(startHotel: Pt | null, endHotel: Pt | null, dayAttractions: Pt[]): Pt[] {
  if (dayAttractions.length === 0) {
    return [...(startHotel ? [startHotel] : []), ...(endHotel ? [endHotel] : [])];
  }
  const nodes: Pt[] = [
    ...(startHotel ? [startHotel] : []),
    ...dayAttractions,
    ...(endHotel ? [endHotel] : []),
  ];
  const n = nodes.length;
  const m = buildMatrix(nodes);
  const hasStart = !!startHotel;
  const hasEnd = !!endHotel;
  const startIdx = hasStart ? 0 : -1;
  const endIdx = hasEnd ? n - 1 : -1;

  // 中間景點索引
  const middle: number[] = [];
  for (let i = 0; i < n; i++) if (i !== startIdx && i !== endIdx) middle.push(i);

  // 受限 NN：從 start 出發（無 start 則從第一個中間點），end 節點全程「抽起來」不參與
  const order: number[] = [];
  const visited = new Set<number>();
  let cur: number;
  if (hasStart) { cur = startIdx; } else { cur = middle[0]; }
  order.push(cur); visited.add(cur);
  while (visited.size < (hasStart ? 1 : 0) + middle.length) {
    let best = -1, bd = Infinity;
    for (const j of middle) if (!visited.has(j) && m[cur][j] < bd) { best = j; bd = m[cur][j]; }
    if (best < 0) break;
    order.push(best); visited.add(best); cur = best;
  }
  if (hasEnd) order.push(endIdx); // end 釘在最後

  // 2-opt 只在「可動位置」反轉：頭(若有 start)與尾(若有 end)固定不動
  const posLo = hasStart ? 1 : 0;
  const posHi = order.length - 1 - (hasEnd ? 1 : 0);
  let best = [...order], improved = true;
  while (improved) {
    improved = false;
    for (let i = Math.max(1, posLo); i <= posHi; i++) {
      for (let j = i + 1; j <= posHi; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        if (routeCost(cand, m) < routeCost(best, m)) { best = cand; improved = true; }
      }
    }
  }
  return best.map((i) => nodes[i]);
}

// ============================================================
// 範例資料：東京 3 飯店 + 9 景點
// ============================================================
const hotels: Pt[] = [
  { name: '🏨 淺草 Hotel', lat: 35.7148, lng: 139.7967 },
  { name: '🏨 新宿 Hotel', lat: 35.6896, lng: 139.7006 },
  { name: '🏨 台場 Hotel', lat: 35.6300, lng: 139.7790 },
];
const attractions: Pt[] = [
  { name: '雷門/淺草寺', lat: 35.7148, lng: 139.7967 },
  { name: '東京晴空塔', lat: 35.7101, lng: 139.8107 },
  { name: '上野公園', lat: 35.7156, lng: 139.7730 },
  { name: '明治神宮', lat: 35.6764, lng: 139.6993 },
  { name: '新宿御苑', lat: 35.6852, lng: 139.7100 },
  { name: '澀谷十字路口', lat: 35.6595, lng: 139.7005 },
  { name: '台場海濱公園', lat: 35.6309, lng: 139.7800 },
  { name: '富士電視台', lat: 35.6273, lng: 139.7745 },
  { name: '豐洲市場', lat: 35.6450, lng: 139.7866 },
];

function fmtMin(m: number): string { return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, '0')}`; }

function main() {
  console.log('=== 住宿排程 PoC — Approach B（容量感知就近分群）===\n');

  const nightOrder = inferNightOrder(hotels, attractions);
  console.log('1) 推斷住宿夜序：');
  nightOrder.forEach((h, n) => console.log(`   夜${n + 1} → ${hotels[h].name}`));

  const nightHotels = nightOrder.map((i) => hotels[i]);
  const buckets = clusterFillForward(attractions, nightHotels);

  console.log('\n2) 累進填滿分群（優先排滿前面、溢到隔天、不平分；每天預算 8h）：');
  buckets.forEach((b, n) => {
    const load = b.reduce((s, i) => s + (attractions[i].dwellMin ?? DEFAULT_DWELL), 0);
    console.log(`   夜${n + 1} (${nightHotels[n].name})  停留合計 ${fmtMin(load)}：`);
    b.forEach((i) => console.log(`        - ${attractions[i].name}`));
  });

  console.log('\n3) 每天端點固定路線（起=昨晚飯店, 終=今晚飯店）：');
  const N = nightHotels.length;
  for (let day = 1; day <= N + 1; day++) {
    const startHotel = day >= 2 ? nightHotels[day - 2] : null;     // 昨晚
    const endHotel = day <= N ? nightHotels[day - 1] : null;        // 今晚（最後一天回家=null）
    const dayAttr = day <= N ? buckets[day - 1].map((i) => attractions[i]) : []; // 末日景點由 Lane A 處理，這裡示意空
    const seq = routeDay(startHotel, endHotel, dayAttr);
    const label = seq.map((p) => p.name).join('  →  ') || '(末日：回家，Lane A 負責)';
    console.log(`   Day ${day}: ${label}`);
  }

  console.log('\n說明：夜序、分群、每天順序皆為決定性（同輸入同輸出），可寫測試。');
}

main();

export { inferNightOrder, clusterFillForward, routeDay, haversineSec };

/**
 * 추천 엔진 시뮬레이터
 *
 * index.html은 빌드 과정이 없는 단일 파일이라, 순수 로직만 잘라내
 * 노드에서 실행한다. 추천 로직(fallbackRecommendations)을 수정했다면
 * 반드시 이걸 돌려서 하드 규칙이 깨지지 않았는지 확인할 것.
 *
 *   node test-engine.js
 */
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/)[0];

function slice(start, end) {
  const a = script.indexOf(start);
  const b = script.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`앵커를 못 찾음: ${start}`);
  return script.slice(a, b);
}

// 순수 로직 구간만 이어붙인다 (DOM에 의존하지 않는 부분)
const code =
  slice('const MBTI_PROFILES', 'async function loadSaved') +
  slice('const OFFLINE_BANK', 'const STATUS_POOL') +
  slice('const STATUS_POOL', 'function fallbackRecommendations') +
  slice('function personalizeLoc', 'function buildReason') +
  slice('function buildReason', '// ---------- render ticket') +
  slice('function fallbackRecommendations', '// "동네"/"근처"') +
  '\nmodule.exports={fallbackRecommendations,OFFLINE_BANK,EXCLUDE_CATEGORIES,isExcluded};';

const m = { exports: {} };
new Function('module', code)(m);
const { fallbackRecommendations, OFFLINE_BANK, EXCLUDE_CATEGORIES, isExcluded } = m.exports;

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}
function findSource(item) {
  return OFFLINE_BANK.find(
    b => b.icon === item.icon && (item.title.includes(b.title) || b.title.includes(item.title))
  );
}

console.log(`활동 수: ${OFFLINE_BANK.length}\n`);

// ── 1. 예산 규칙 ────────────────────────────────────────────
console.log('예산 규칙');
{
  let freeOnly = true, paidOnly = true;
  for (let i = 0; i < 200; i++) {
    fallbackRecommendations({ time:'1시간', money:'무료', solo:'혼자', loc:'근처', mood:'', mbti:'', age:30, exclude:[] })
      .items.forEach(it => { const s = findSource(it); if (s && s.minMoney !== 0) freeOnly = false; });
    fallbackRecommendations({ time:'2시간', money:'~3만원', solo:'혼자', loc:'근처', mood:'', mbti:'', age:30, exclude:[] })
      .items.forEach(it => { const s = findSource(it); if (s && (s.minMoney === 0 || s.minMoney > 2)) paidOnly = false; });
  }
  check('무료 선택 → 무료 활동만', freeOnly);
  check('~3만원 선택 → 1~3만원 활동만 (무료 제외)', paidOnly);
}

// ── 2. 시간 규칙 ────────────────────────────────────────────
console.log('\n시간 규칙');
{
  let ok = true;
  for (let i = 0; i < 200; i++) {
    fallbackRecommendations({ time:'2시간', money:'~3만원', solo:'혼자', loc:'근처', mood:'', mbti:'', age:30, exclude:[] })
      .items.forEach(it => { const s = findSource(it); if (s && (s.minTime < 2 || s.minTime > 3)) ok = false; });
  }
  check('2시간 선택 → 너무 짧은 활동 제외', ok);
}

// ── 3. 미성년자 안전 (하드 규칙) ─────────────────────────────
console.log('\n미성년자 안전');
{
  let leaks = 0;
  for (let i = 0; i < 300; i++) {
    fallbackRecommendations({ time:'반나절', money:'5만원+', solo:'같이', loc:'서울', mood:'신나게', mbti:'ESTP', age:17, exclude:[] })
      .items.forEach(it => { const s = findSource(it); if (s && s.adultOnly) leaks++; });
  }
  check('17세에게 adultOnly 노출 0건', leaks === 0, `노출 ${leaks}건`);
}

// ── 4. 제외 범주 (하드 규칙) ────────────────────────────────
console.log('\n제외 범주');
{
  const ex = ['food', 'alcohol', 'workout'];
  let leaks = 0;
  for (let i = 0; i < 300; i++) {
    fallbackRecommendations({ time:'2시간', money:'~3만원', solo:'혼자', loc:'강남역', mood:'', mbti:'ENFP', age:28, exclude:ex })
      .items.forEach(it => { const s = findSource(it); if (s && isExcluded(s, ex)) leaks++; });
  }
  check('제외한 범주 노출 0건', leaks === 0, `노출 ${leaks}건`);

  // 전 범주를 제외해도 어느 범주에도 안 걸리는 활동(16개)은 남는다.
  // 따라서 "무조건 안내 문구"가 아니라 "결과가 3개 미만일 때만 안내"가 올바른 계약이다.
  const all = EXCLUDE_CATEGORIES.map(c => c.key);
  let contractOk = true;
  for (let i = 0; i < 100; i++) {
    const r = fallbackRecommendations({ time:'2시간', money:'~3만원', solo:'혼자', loc:'근처', mood:'', mbti:'', age:30, exclude:all });
    if ((r.items.length < 3) !== !!r.note) contractOk = false;
  }
  check('결과가 부족할 때만 안내 문구 표시', contractOk);
}

// ── 5. 기분이 최우선 신호인지 ────────────────────────────────
console.log('\n기분 우선순위');
{
  let hits = 0;
  const N = 100;
  for (let i = 0; i < N; i++) {
    const r = fallbackRecommendations({ time:'2시간', money:'~3만원', solo:'혼자', loc:'강남역', mood:'힐링', mbti:'ENFP', age:24, exclude:[] });
    const s = findSource(r.items[0]);
    if (s && s.mood.some(k => ['힐링','조용히','편하게'].includes(k))) hits++;
  }
  // ENFP(신나게 성향) + 24세와 반대되는 "힐링"을 입력해도 기분이 이겨야 한다
  check('기분이 MBTI·나이를 이기고 반영됨', hits / N >= 0.8, `${hits}/${N}회`);
}

// ── 6. 다양성 ──────────────────────────────────────────────
console.log('\n다양성');
{
  let dupes = 0;
  for (let i = 0; i < 100; i++) {
    const r = fallbackRecommendations({ time:'2시간', money:'~3만원', solo:'혼자', loc:'근처', mood:'', mbti:'', age:30, exclude:[] });
    const titles = r.items.map(x => x.title);
    if (new Set(titles).size !== titles.length) dupes++;
  }
  check('같은 티켓에 중복 항목 없음', dupes === 0, `중복 ${dupes}회`);
}

// ── 7b. 재추천 다양성(novelty) ────────────────────────────
console.log('\n재추천 다양성');
{
  // 후보 풀이 넉넉한 조건에서 "다시 뽑기"를 반복하면 1순위가 계속 바뀌는지 확인
  // (풀 자체가 결과 개수와 같은 극단적으로 얕은 조합은 다양화할 여지가 없으므로 제외)
  const firsts = new Set();
  for (let i = 0; i < 10; i++) {
    const r = fallbackRecommendations({ time:'1시간', money:'~3만원', solo:'any', loc:'근처', mood:'', mbti:'', age:30, exclude:[] });
    if (r.items[0]) firsts.add(r.items[0].title);
  }
  check('같은 조건 반복 추천 시 1순위가 매번 고정되지 않음', firsts.size >= 2, `서로 다른 1순위 ${firsts.size}종류`);
}

// ── 7c. 소요시간(slots) 필드 ───────────────────────────────
console.log('\n소요시간 필드');
{
  let ok = true;
  const r = fallbackRecommendations({ time:'2시간', money:'~3만원', solo:'혼자', loc:'근처', mood:'', mbti:'', age:30, exclude:[] });
  r.items.forEach(it => { if (!Number.isInteger(it.slots) || it.slots < 1 || it.slots > 4) ok = false; });
  check('추천 항목마다 slots(1~4) 값이 붙음', ok);
}

// ── 7. 장소 반영 ───────────────────────────────────────────
console.log('\n장소 반영');
{
  let replaced = false;
  for (let i = 0; i < 100; i++) {
    fallbackRecommendations({ time:'1시간', money:'~1만원', solo:'혼자', loc:'홍대', mood:'', mbti:'', age:30, exclude:[] })
      .items.forEach(it => { if (it.title.includes('홍대') || it.desc.includes('홍대')) replaced = true; });
  }
  check('입력한 지역명이 결과에 반영됨', replaced);
}

console.log(`\n${failures === 0 ? '전부 통과' : failures + '건 실패'}`);
process.exit(failures === 0 ? 0 : 1);

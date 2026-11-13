// T07 카드 5: 5일 관찰. 하루 실행 시간(분)을 서울 날짜별로 집계한다.
// 규칙(사용자가 정함, 2026-11-13):
//  - 날짜: 실행 기록의 시작 시각이 속한 서울 날짜
//  - 중복: 같은 날 시간이 겹치는 기록은 겹친 구간을 한 번만 센다
//          → 겹치는 기록끼리 묶어, 묶음마다 min(실제 시간 합, 묶음의 시작~끝 분)
//  - 이상값: 한 기록의 실제 시간이 240분을 넘으면 표시만 하고 합계에는 넣는다
//  - 결측: 시작일 이후 기록이 없는 날은 0분으로 표에 보이고, 일차 번호·평균에는 넣지 않는다
//  - 일차: 시작일 이후 기록이 있는 서울 날짜를 순서대로 1~5일차
//  - 반올림: 평균은 소수 첫째 자리에서 반올림한 정수 분
//  - 주 시작: 월요일
export const OUTLIER_MINUTES = 240;
export const OBS_DAYS = 5;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const seoulDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(d));
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (ymd) => { const wd = (new Date(ymd + 'T00:00:00Z').getUTCDay() + 6) % 7; return addDays(ymd, -wd); };
export const roundHalfUp = (x) => Math.floor(x + 0.5);

// 하루치 실행 기록 → 겹침 묶음과 그날 집계 분
export function dayMinutes(runs) {
  const sorted = [...runs].sort((a, b) => new Date(a.started_at) - new Date(b.started_at) || Number(a.id) - Number(b.id));
  const groups = [];
  for (const r of sorted) {
    const s = new Date(r.started_at).getTime(), e = new Date(r.ended_at).getTime();
    const g = groups.at(-1);
    if (g && s < g.end) { g.runs.push(r); g.end = Math.max(g.end, e); g.actual += r.actual_minutes; }
    else groups.push({ start: s, end: e, actual: r.actual_minutes, runs: [r] });
  }
  let minutes = 0;
  const out = groups.map((g) => {
    const span = Math.round((g.end - g.start) / 60_000);
    const counted = g.runs.length > 1 ? Math.min(g.actual, span) : g.actual;
    minutes += counted;
    return { run_ids: g.runs.map((r) => r.id), actual_sum: g.actual, span_minutes: span, counted_minutes: counted, overlapped: g.runs.length > 1 };
  });
  return { minutes, groups: out };
}

// 관찰 화면 데이터. runs는 이 사용자의 실행 기록 전체(시작일 이전 포함 가능).
export function buildObservation(obs, change, runs, todaySeoul) {
  const byDate = {};
  for (const r of runs) {
    const d = seoulDate(r.started_at);
    if (d < obs.start_date) continue;
    (byDate[d] ||= []).push({ ...r, outlier: r.actual_minutes > OUTLIER_MINUTES });
  }
  const recorded = Object.keys(byDate).sort();
  const dayNo = Object.fromEntries(recorded.slice(0, OBS_DAYS).map((d, i) => [d, i + 1]));
  const lastObserved = recorded[OBS_DAYS - 1];
  const until = lastObserved || (todaySeoul > obs.start_date ? todaySeoul : obs.start_date);
  const rows = [];
  for (let d = obs.start_date; d <= until; d = addDays(d, 1)) {
    const list = byDate[d] || [];
    const { minutes, groups } = dayMinutes(list);
    rows.push({
      date: d, day: dayNo[d] ?? null, missing: !list.length, minutes,
      runs: list.sort((a, b) => new Date(a.started_at) - new Date(b.started_at)), groups,
      first_saved_at: list.length ? new Date(Math.min(...list.map((r) => new Date(r.created_at).getTime()))).toISOString() : null,
      last_saved_at: list.length ? new Date(Math.max(...list.map((r) => new Date(r.created_at).getTime()))).toISOString() : null,
    });
  }
  const observed = rows.filter((r) => r.day);
  const sum = (xs) => xs.reduce((a, r) => a + r.minutes, 0);
  const avg = (xs) => (xs.length ? roundHalfUp(sum(xs) / xs.length) : null);
  const before = observed.filter((r) => r.day <= 2), after = observed.filter((r) => r.day >= 3);

  // 규칙 변경이 2일차 마지막 저장 뒤이고 3일차 첫 저장 앞인지(저장 시각 기준)
  let order = null;
  if (change) {
    const d2 = observed.find((r) => r.day === 2), d3 = observed.find((r) => r.day === 3);
    const t = new Date(change.changed_at).getTime();
    order = {
      after_day2: d2 ? t > new Date(d2.last_saved_at).getTime() : false,
      before_day3: d3 ? t < new Date(d3.first_saved_at).getTime() : true,
      day1_date: observed.find((r) => r.day === 1)?.date ?? null,
      day2_date: d2?.date ?? null,
      day3_date: d3?.date ?? null,
    };
    order.ok = order.after_day2 && order.before_day3;
  }

  const weeks = {};
  for (const r of observed) { const w = mondayOf(r.date); weeks[w] = (weeks[w] || 0) + r.minutes; }

  return {
    observation: obs,
    rule_change: change,
    can_change_rule: !change && observed.length === 2,
    change_blocked_reason: change ? '이미 한 번 바꿨습니다'
      : observed.length < 2 ? `2일차까지 기록이 있어야 바꿀 수 있습니다(지금 ${observed.length}일차까지)`
      : observed.length > 2 ? '3일차 기록이 이미 있어 바꿀 수 없습니다' : null,
    rules: { outlier_minutes: OUTLIER_MINUTES, days: OBS_DAYS },
    rows,
    summary: {
      observed_days: observed.length,
      total_minutes: sum(observed), average_minutes: avg(observed),
      hand_sum: observed.map((r) => `${r.day}일차 ${r.minutes}`).join(' + ') + ` = ${sum(observed)}`,
      before: { days: before.map((r) => r.day), total_minutes: sum(before), average_minutes: avg(before) },
      after: { days: after.map((r) => r.day), total_minutes: sum(after), average_minutes: avg(after) },
      weeks: Object.entries(weeks).map(([monday, minutes]) => ({ monday, minutes })),
    },
    order,
  };
}

export function validateObservation(b, text) {
  if (typeof b.start_date !== 'string' || !DATE_RE.test(b.start_date)) throw Object.assign(new Error('시작일은 YYYY-MM-DD 형식입니다'), { status: 400 });
  return {
    start_date: b.start_date,
    question: text(b.question, '관찰 질문', 300),
    metric: text(b.metric, '지표', 100),
    unit: text(b.unit, '단위', 20),
    calc_rule: text(b.calc_rule, '계산 규칙', 1000),
    missing_rule: text(b.missing_rule, '결측값 처리', 300),
    duplicate_rule: text(b.duplicate_rule, '중복값 처리', 300),
    outlier_rule: text(b.outlier_rule, '이상값 처리', 300),
    rounding_rule: text(b.rounding_rule, '반올림 규칙', 300),
    week_start: text(b.week_start, '주 시작 요일', 20),
    rule_before: text(b.rule_before, '변경 전 계획 규칙', 300),
  };
}

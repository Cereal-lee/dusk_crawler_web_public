// 동작 정의 — 모두 격자 1장을 생성해 서버가 자른다.
// walk 는 기준 포즈를, 나머지는 **완성된 걷기 시트**를 레퍼런스로 쓴다(실측: 레퍼런스가 흔들림을 막는다).
// 원본 화면의 ANIMS 를 그대로 옮기되, 프롬프트 조립에 필요한 필드(promptFrames 등)를 promptBuilder 가 갖는다.

// size 는 생성 요청에 넘기는 픽셀 크기. 격자가 가로로 길면 landscape 를 줘야
// 셀이 찌그러지지 않는다 (백엔드가 size 를 무시할 때를 대비해 프롬프트에도 문장으로 들어간다).
// 기준 포즈 5방향 세트 — 3x2 턴어라운드 격자 1장으로 생성해 방향별 프레임을 얻는다.
// (한 생성 안에서 나와야 방향 간 정체성이 일치 — "한 번의 생성으로 만든 격자" 원칙)
// 셀 순서 = 회전 순서 고정: 1=앞(0°), 2=45도(45°), 3=옆(90°), 4=뒷45도(135°), 5=뒤(180°).
// 6번 칸은 앞면 반복(모델이 빈칸을 창작하지 않게) — 서버가 keep:5 로 제외한다 (걷기 keep:7 과 같은 설계).
export const BASE_VIEWS = [
  { key: 'front', label: '앞면', cell: 0 },
  { key: 'quarter', label: '45도', cell: 1 },
  { key: 'side', label: '옆면', cell: 2 },
  { key: 'quarterBack', label: '뒷45도', cell: 3 },
  { key: 'back', label: '뒷면', cell: 4 },
];

export const ANIMS = [
  // 8프레임 고정 — 14회 실험에서 4·6프레임은 상하 움직임이 안 나오거나 발 패턴이 깨졌다.
  {
    // 일반 걷기 — 팀장 픽셀 레퍼런스(느긋한 걸음)를 색 차트 규격으로 이식한 차트 기반 (2026-08-03).
    // 차트는 8포즈 완전 루프(중복 접지 없음) → keep 불필요. 미러 줄은 limbSwap 색 반전으로 제작.
    key: 'walk_basic',
    label: '걷기 (옆면)',
    frames: 8,
    cols: 4,
    rows: 2,
    chartPoses: 8, // 차트 포즈 수 — 프레임 배정 블록이 이 값을 따른다
    guides: { mini: '/sd/guides/walk-cycle-color-grid-mini-basic.png' }, // 비율별 차트 (없으면 mini 폴백)
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 8,
    from: 'base',
    view: 'side',
    baseView: 'side',
  },
  {
    // 45도 걷기 — hdotwall.gif 대각선 줄(앞45도) 실프레임을 차트로 변환한 것 기반 (2026-08-04).
    // 다리 색 배정은 근측이 아니라 레퍼런스의 짝짝이 신발(물리적 다리) 고정 — 대각선에선
    // 근측이 프레임마다 애매해서, "같은 다리가 계속 같은 색"이 스왑 방지의 본질이다.
    key: 'walk_basic_quarter',
    label: '걷기 (45도)',
    frames: 8,
    cols: 4,
    rows: 2,
    chartPoses: 8,
    guides: { mini: '/sd/guides/walk-cycle-color-grid-mini-basic-quarter.png' },
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 8,
    from: 'base',
    view: 'quarter',
    baseView: 'quarter',
  },
  {
    // 뒷45도 걷기 — hdotwall.gif 대각선 줄(뒷45도=135도) 기반. 위와 같은 설계.
    key: 'walk_basic_quarter_back',
    label: '걷기 (뒷45도)',
    frames: 8,
    cols: 4,
    rows: 2,
    chartPoses: 8,
    guides: { mini: '/sd/guides/walk-cycle-color-grid-mini-basic-quarter-back.png' },
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 8,
    from: 'base',
    view: 'quarterBack',
    baseView: 'quarterBack',
  },
  // keep:7 — 8칸을 생성해 앞 7프레임만 시트로 채택. 팀장 색 구조 차트의 8번 포즈는 1번과
  // 같은 중복 접지라 루프에서 겹친다(실측). 위상 템플릿도 7프레임 실측 리듬을 쓴다.
  {
    // 팀장 원본 색 차트(보폭 큰 2박자) 기반 — 일반 걷기 신설 후 "빠른걸음"으로 재명명 (2026-08-03)
    key: 'walk',
    label: '빠른걸음 (옆면)',
    frames: 8,
    cols: 4,
    rows: 2,
    keep: 7,
    chartPoses: 7,
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 10,
    from: 'base',
    view: 'side',
    baseView: 'side', // 기준 세트의 옆면 프레임을 캐릭터 레퍼런스로 쓴다
  },
  {
    // 옆면 대기는 완성된 걷기 시트가 있으면 그걸(시점·키·그림체 상속), 없으면 옆면 기준을 쓴다
    key: 'idle',
    label: '대기 (옆면)',
    frames: 6,
    cols: 3,
    rows: 2,
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 8,
    from: 'walk',
    view: 'side',
    baseView: 'side',
  },
  {
    // 정면 대기는 옆모습 걷기 시트가 아니라 **기준 앞면**을 레퍼런스로 써야 한다.
    // 옆모습 시트를 붙이면 모델이 몸을 반쯤 틀어 그린다 (실측).
    key: 'idle_front',
    label: '대기 (앞면)',
    frames: 6,
    cols: 3,
    rows: 2,
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 8,
    from: 'base',
    view: 'front',
    baseView: 'front',
  },
  {
    key: 'idle_back',
    label: '대기 (뒷면)',
    frames: 6,
    cols: 3,
    rows: 2,
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 8,
    from: 'base',
    view: 'back',
    baseView: 'back',
  },
  {
    key: 'idle_quarter',
    label: '대기 (45도)',
    frames: 6,
    cols: 3,
    rows: 2,
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 8,
    from: 'base',
    view: 'quarter',
    baseView: 'quarter',
  },
  {
    key: 'idle_quarter_back',
    label: '대기 (뒷45도)',
    frames: 6,
    cols: 3,
    rows: 2,
    ratio: '3:2',
    size: '1536x1024',
    align: 'bottom',
    fps: 8,
    from: 'base',
    view: 'quarterBack',
    baseView: 'quarterBack',
  },
  // 공격은 일단 제외 (팀장 지시 2026-08-03). 4방향 턴은 기준 세트가 대신한다.
];

export const CHROMA = [
  { key: 'green', label: '크로마 그린', hex: '#00FF00', word: 'green', hint: '기본 — 캐릭터 색과 겹칠 일이 가장 적음' },
  { key: 'magenta', label: '마젠타', hex: '#FF00FF', word: 'magenta', hint: '캐릭터에 초록이 있을 때' },
];

// SD 비율 — 2등신(구 '미니')이 주력이라 맨 앞 (팀장 지시 2026-08-03). key 는 레코드 호환을 위해 유지.
export const PROPORTIONS = [
  { key: 'mini', label: 'SD 2등신', hint: '머리:몸 = 1:1, 몸 단순화 — 주력 비율' },
  { key: 'sd', label: 'SD 2.5등신', hint: '머리가 키의 40% 정도' },
  { key: 'h4', label: '4등신', hint: '머리가 키의 25% — 액션 게임 표준 치비' },
  { key: 'h6', label: '6등신', hint: '머리가 키의 ~17% — 실사형 애니 비율' },
];
export const PROPORTION_SUFFIX = { mini: ' (2등신)', h4: ' (4등신)', h6: ' (6등신)' };

// 내보내기 파일명 규격: {SD-등신}_{캐릭터}_{의상}_{동작}  예) SD-2_sofia_sweater_walk.png
export const PROPORTION_PREFIX = { sd: 'SD-2-5', mini: 'SD-2', h4: 'SD-4', h6: 'SD-6' };
const fnSafe = (s, fallback) => {
  const clean = (s || '').trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|_]/g, '');
  return clean || fallback;
};
/** 기준 포즈 레코드 + 동작 키 → 확장자 없는 파일명 줄기 */
export function exportStem(base, animKey = 'base') {
  const prefix = PROPORTION_PREFIX[base?.proportion] || PROPORTION_PREFIX.sd;
  // 표시 이름에는 비율 접미사(" (2등신)" — 구 레코드는 " (미니)")가 붙어 있다 — 파일명에서는 뗀다
  const raw = (base?.nameRaw || base?.name || '').replace(/\s*\((미니|2등신|4등신|6등신)\)\s*$/, '');
  return `${prefix}_${fnSafe(raw, 'character')}_${fnSafe(base?.outfit, 'default')}_${animKey}`;
}

// 걷기 포즈 가이드 — 팀장이 만든 색 구분 구조 차트를 생성 격자와 같은 4x2 배치로 재조립한 것
// (빨강=바깥 팔다리, 파랑=안쪽 팔다리, 셀8은 셀1과 같은 중복 접지 — 서버가 keep:7 로 제외).
// 편집-치환 방식: 이 격자를 첫 번째 레퍼런스로 주고 "각 마네킹을 캐릭터로 다시 그려라"고 지시
// → 셀별 1:1 포즈 대응. 색이 프레임별 팔다리 배정을 원천 고정한다.
// 비율별 차트: 같은 색 배정(빨강=바깥, 파랑=안쪽)을 각 등신 마네킹으로 옮긴 것.
// 전부 public/sprite-guides 의 평범한 PNG — 사용자가 직접 수정/교체할 수 있고,
// 교체 후 standalone/check-color-chart.mjs 로 색 배정을 검증하면 된다.
export const WALK_GUIDES = {
  sd: '/sd/guides/walk-cycle-color-grid.png', // 팀장 원본 (2.5등신)
  mini: '/sd/guides/walk-cycle-color-grid-mini.png', // 다리 부호 8/8 검증
  h4: '/sd/guides/walk-cycle-color-grid-4h.png',
  h6: '/sd/guides/walk-cycle-color-grid-6h.png',
};

export const getAnim = (key) => ANIMS.find((a) => a.key === key) || ANIMS[0];
export const getChroma = (key) => CHROMA.find((c) => c.key === key) || CHROMA[0];
export const getProportion = (key) => PROPORTIONS.find((p) => p.key === key) || PROPORTIONS[0];

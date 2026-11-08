// 프롬프트 조립기 v2 — rules/ 의 MD 를 코드로 옮긴 것.
//
// 왜 클로드에게 매번 쓰게 하지 않는가: docs/sd-walk-experiments.md 첫 줄에 적힌 대로
// "프롬프트는 코드로 조립해 클로드 변수를 제거했다". 25회 실험에서 조건 하나씩만 바꿔
// 비교할 수 있었던 건 나머지 문장이 글자 단위로 동일했기 때문이다.
//
// v2 에서 바뀐 것:
//  - 비율 4종(sd/mini/h4/h6) — 기준 포즈 헤더를 rules 3.5~3.7 절대로 교체.
//    영문 블록은 assets/records.json 의 실제 성공 프롬프트(26·28·29번 레코드)에서 그대로 가져왔다.
//  - 걷기 = 색 구조 차트 편집-치환: [색 격자(첫 번째 레퍼런스=포즈 캔버스), 캐릭터(두 번째=정체성)].
//    프레임 1~7 = 차트 포즈 그대로, 프레임 8 = 포즈7→1 복귀 중간 동작(서버가 keep:7 로 제외).
//  - FULL INNER-LIMB SHADOW + HEAD SIZE LOCK 하드룰 블록 (실측 검증 — rules MD "색 구조 가이드" 절).
// 규칙을 고칠 때는 MD 와 여기를 함께 고친다.

import { getChroma } from './anims.mjs';

/* ── 배경 크로마 치환 ──────────────────────────────────────────────── */
const bg = (chromaKey) => {
  const c = getChroma(chromaKey);
  return {
    sentence: `Solid flat chroma key ${c.word} background, exact hex ${c.hex}, with no gradients, no noise, no texture, no ground shadow. The gaps between cells are the same flat ${c.word} background - never white, never any drawn line. No ${c.word} anywhere on the character itself.`,
    baseSentence: `Solid flat chroma key ${c.word} background, exact hex ${c.hex}, with no gradients, no noise, no shadow on the ground. No ${c.word} anywhere on the character itself.`,
  };
};

/* ── 기준 포즈: 비율별 프롬프트 (rules/sd-from-standing §1 + 3.5~3.7) ──
   각 항목의 영문은 실제 생성에 성공한 레코드의 프롬프트에서 그대로 가져온 것이다:
   sd = 7번(은발 메이드), mini = 26번, h4 = 28번, h6 = 29번. 글자를 바꾸면 비교가 끊긴다. */
const BASE_VARIANTS = {
  sd: {
    header:
      'Redraw the character in the reference image as a chibi super-deformed game sprite, exactly 2.5 heads tall, standing in a neutral idle pose with both feet flat on the ground and arms relaxed at the sides.',
    keep:
      'Keep the exact same character: identical hairstyle and hair color, identical face, identical outfit with every part in the same colors, identical accessories and weapon. Do not redesign, do not restyle, do not change any color. Simplify small details only as much as the smaller size requires.',
    negatives:
      'No different character, no redesign, no new outfit, no changed colors, no photorealistic, no 3d render, no realistic proportions, no multiple characters, no background scenery, no gradient background, no drop shadow, no ground shadow.',
  },
  mini: {
    header:
      'Redraw the character in the reference image as a chibi super-deformed game sprite, exactly 2 heads tall - the head is HALF of the total height, so the head and the body below it are the SAME height (1:1). The body is radically simplified: a compact rounded torso, stubby tapered limbs with mitten-like hands and tiny simple feet, no visible joints, no neck. Standing in a neutral idle pose with both feet flat on the ground and arms relaxed at the sides.',
    keep:
      'Keep the exact same character: identical hairstyle and hair color, identical face impression with big eyes in the original eye color, identical outfit with every part in the same colors, identical accessories. Simplify costume details boldly - frills become simple silhouette bumps, patterns become flat color blocks - but keep every color and every key item recognizable.',
    negatives:
      'No different character, no redesign, no new outfit, no changed colors, no photorealistic, no 3d render, no realistic proportions, no multiple characters, no background scenery, no gradient background, no drop shadow, no ground shadow.',
  },
  h4: {
    header:
      'Redraw the character in the reference image as a chibi game sprite, exactly 4 heads tall - the head is ONE QUARTER of the total height, with a defined torso, arms with visible elbows, and legs with visible knees, like a standard action-game chibi. Standing in a neutral idle pose with both feet flat on the ground and arms relaxed at the sides.',
    keep:
      'Keep the exact same character: identical hairstyle and hair color, identical face impression with big eyes in the original eye color, identical outfit with every part in the same colors, identical accessories. Keep costume details slightly simplified but recognizable - frills and buckles stay visible in simpler form.',
    negatives:
      'No different character, no redesign, no new outfit, no changed colors, no photorealistic, no 3d render, no realistic proportions, no multiple characters, no background scenery, no gradient background, no drop shadow, no ground shadow.',
  },
  h6: {
    header:
      'Redraw the character in the reference image as a game sprite, about 6 heads tall - near-realistic anime proportions, the head is about one sixth of the total height, with a slim torso, long arms with clear elbows, and long legs with clear knees. Standing in a neutral idle pose with both feet flat on the ground and arms relaxed at the sides.',
    keep:
      'Keep the exact same character: identical hairstyle and hair color, identical face, identical outfit with every part in the same colors, identical accessories - keep most of the original detail, this proportion needs almost no simplification.',
    // 6등신은 실사형 비율 그 자체라 "no realistic proportions" 를 넣으면 자기모순 (29번 레코드도 뺐다)
    negatives:
      'No different character, no redesign, no new outfit, no changed colors, no photorealistic, no 3d render, no multiple characters, no background scenery, no gradient background, no drop shadow, no ground shadow.',
  },
};

const BASE_TAIL = (chromaKey) =>
  `Bold clean black outlines, flat cel-shading, bright saturated colors. ${bg(chromaKey).baseSentence} Add a clean white outline 2-3 pixels wide around the character. Full body visible head to toe, centered, with clear margin. No text, no numbers, no labels, no watermark, no panel borders.`;

/* ── 기준 5방향 세트 (3x2 턴어라운드 격자, 6번 칸 = 앞면 반복 → keep:5) ──
   앞/45도/옆/뒷45도/뒤를 **한 격자로 한 번에** 생성해야 방향 간 정체성이 일치한다.
   셀 순서 = 회전 순서, lib/anims.js 의 BASE_VIEWS 와 고정 계약. 빈칸을 두면 모델이
   창작하므로 6번은 앞면을 반복시키고 서버가 버린다 (걷기 차트 8번=1번과 같은 설계). */
const BASE_TURNAROUND_GRID = (chromaKey) =>
  `Draw a 3-by-2 grid of exactly 6 cells showing this SAME character in the SAME neutral idle pose (arms relaxed at the sides, both feet flat on the ground), rotating step by step: cell 1 (top-left) = FRONT view facing the camera; cell 2 (top-middle) = FRONT THREE-QUARTER view, the body turned 45 degrees toward screen-right - her near shoulder (the one closer to the camera) sits on the screen-LEFT side of the body and the face looks toward screen-RIGHT, never toward screen-left; cell 3 (top-right) = SIDE view in strict profile facing screen-right; cell 4 (bottom-left) = BACK THREE-QUARTER view, the body turned 135 degrees toward screen-right so the character faces the UPPER-RIGHT of the screen - the camera sees mostly the back, the head is seen from behind and clearly turned toward screen-right, her near shoulder sits on the screen-right side of the body, and the side of the face's outline may show but NO facial features - never turned toward screen-left; cell 5 (bottom-middle) = BACK view facing directly away from the camera, showing the back of the hair and the back of the outfit; cell 6 (bottom-right) = an EXACT REPEAT of cell 1's front view. The character is IDENTICAL in all cells: same height, same head size, same colors, same outfit details, same ground line - only the facing direction changes. Every cell is the same size, evenly spaced, with clear empty gaps between cells and no overlap. ${bg(chromaKey).sentence} Add a clean white outline 2-3 pixels wide around the character in every cell. Absolutely no text, no numbers, no labels, no watermarks, no panel borders, no grid lines.`;

/* ── 스타일 앵커 (기준 포즈 두 번째 레퍼런스) ─────────────────────────
   생성마다 그림체가 조금씩 흔들리는 문제 대응 — 확정된 스프라이트 1장을 "그림체만 참조"로
   붙인다. 걷기의 색 차트가 "포즈만 참조"로 작동하는 것과 같은 역할 분리 문법. */
const STYLE_ANCHOR_BLOCK =
  'The SECOND reference image is a STYLE ANCHOR ONLY. It shows another character from several directions - match its art style EXACTLY in every cell you draw: the same line weight and outline treatment, the same flat cel-shading with the same number of shade steps, the same head-to-body ratio and limb simplification, the same eye rendering style and face simplification level, the same white outline. The GRID you must produce is the one described above, regardless of how the anchor is arranged. Take NOTHING else from the second image - not its hair, not its face, not its outfit, not its colors, not its identity, and NOT ITS FACING DIRECTIONS: even if the anchor character faces screen-left in some cells, the facing of every cell you draw comes ONLY from the grid instructions above. The character is entirely from the FIRST reference image; the second image only dictates HOW it is drawn.';

/* ── 고정 기술 블록 (rules/sd-sprite-prompt-rules §2) ───────────────
   셀 사이 배경 문장이 v1 과 다르다: 색 구조 차트(흰 배경)를 캔버스로 주면 모델이 셀 사이를
   흰 선으로 그리는 사고가 났다 — 흰 선은 키잉에서 살아남아 거터 탐지를 죽인다(실측).
   "셀 사이도 초록, 흰 선 금지" 를 명시한 배경 블록으로 해결했다. */
const TECH_BLOCK = ({ cols, rows, frames, chromaKey }) =>
  `A ${cols}-by-${rows} grid of exactly ${frames} animation frames of the SAME character, arranged left to right, top to bottom, forming one continuous animation. Match the character reference exactly: same character design, same hairstyle and hair shape, same outfit and colors, same accessories, same proportions, same line weight and shading style, same character height, same ground line. The hair keeps the exact same shape in every frame as it does in the reference - it does not swing, flow or flutter. Every cell is the exact same size, evenly spaced, with clear empty gaps between cells and no overlap. Full body visible head to toe in every cell, centered, with clear margin, nothing cropped. Absolutely no text, no numbers, no digits, no labels, no captions, no watermarks, no panel borders, no grid lines, no separators. ${bg(chromaKey).sentence} Add a clean white outline 2-3 pixels wide around the character in every cell.`;

/* ══ 빠른걸음(walk) 동결 원문 — v1 검증 체계 그대로, 절대 수정 금지 ══════════
   2026-08-05 사고 복원: 걷기(walk_basic) 개정이 공유 블록을 타고 빠른걸음 프롬프트까지
   바꿨다 (팀장 지시 위반 — 빠른걸음은 글자 단위 고정이 원칙). 8/3 ZIP 원문을 그대로 박제.
   이후 어떤 걷기 개정도 이 상수들에 손대지 말 것 — 빠른걸음은 아래 _V1 만 쓴다. */
const VIEW_SIDE_V1 =
  'Orthographic side view, the character faces screen-right in every cell, camera level and identical distance and zoom in every cell. IDENTICAL IN ALL CELLS: the same character, same face, same head size and shape, same hairstyle with the same LENGTH, VOLUME, SILHOUETTE AREA and strand count, same costume, same colours, same outline weight, same lighting. The character does not change size and does not move horizontally within its cell. All cells share one ground line at the same height; only the body rises and falls relative to it.';
const COLOR_GRID_BLOCK_V1 =
  'The FIRST reference image is a COLOR-CODED POSE STRUCTURE GRID: a 4-by-2 grid of 8 mannequin walking poses. REDRAW THAT EXACT GRID cell by cell, replacing the mannequin in every cell with the character from the SECOND reference image - the same cell layout, the same pose in each cell, the same leg positions, the same arm positions, the same body height per cell. In the chart RED marks the OUTER arm and OUTER leg (the side nearest to the viewer) and BLUE marks the INNER arm and INNER leg (the far side). This color coding tells you EXACTLY which limb is which in every pose - follow the limb assignments literally, cell by cell, and never mirror or swap them. The red and blue are ONLY markers in the chart - draw the character entirely in her own colors, with NO red or blue tinting anywhere, and replace the chart\'s white background with the chroma key background. ' +
  'CELL-BY-CELL CHECK - before drawing each cell, look at the SAME-NUMBERED cell of the chart and copy its limb assignment exactly: the character\'s near-side limbs (the bright ones) go where that cell\'s RED arm and leg are, and the far-side limbs (the shadowed ones) go where the BLUE ones are. The cells in the bottom row (5, 6, 7, 8) each have their OWN pose in the chart - they are NOT mirrors or repeats of the top row. Swapping which leg is forward or which leg is lifted in any cell is the single most common error in this task; if a drawn cell disagrees with the chart\'s red/blue assignment for that cell, it is wrong.';
const NEAR_SIDE_LAW_V1 = (cue) =>
  cue
    ? `NEAR-SIDE VISIBILITY LAW: judge the arms by what is VISIBLE in the silhouette, not by anatomical labels. On the cells where the chart's RED (outer) leg swings FORWARD, ${cue} must be HIDDEN BEHIND THE HIP and not visible at all. Only on the cells where the BLUE (inner) leg swings forward does ${cue} appear clearly IN FRONT OF THE CHEST. Apply this cell by cell.`
    : '';
const FRAMES_CHART_V1 = (charPx) => {
  const { low, high } = walkPixels(charPx);
  const rhythm = `Keep the chart's rhythm in pixels: the lowest (RECOIL) cells sit about ${low} pixels lower and the highest (HIGH-POINT) cells about ${high} pixels higher than the CONTACT cells.`;
  return `Frames 1 to 7 of the grid copy the chart's poses 1 to 7 in order: the same leg positions, the same arm positions, the same body height in each cell. Frame 8 is the smooth in-between that returns from pose 7 back to pose 1 so the loop closes. ${rhythm}`;
};
/* ══ 동결 원문 끝 ═══════════════════════════════════════════════════════ */

/* 차트 기반 옆면 걷기(walk_basic) 전용 시점 블록 — **방향의 권위는 차트** (팀장 확정 2026-08-05:
   차트는 그린 그대로 첨부, 좌/우 지시어 대신 "차트 마네킹과 같은 방향"으로 고정 — 팀장이 어느
   방향으로 그리든 결과가 그대로 따라온다. 캐릭터 레퍼런스는 정체성만 제공, 방향은 무시). */
const VIEW_SIDE_CHART =
  'Orthographic side view, camera level and identical distance and zoom in every cell. THE CHART DEFINES THE FACING: the character faces the SAME direction as the chart\'s mannequins in EVERY cell - even if the character reference image faces the opposite way, the character reference provides ONLY the identity (design, colors, proportions), never the facing. IDENTICAL IN ALL CELLS: the same character, same face, same head size and shape, same hairstyle with the same LENGTH, VOLUME, SILHOUETTE AREA and strand count, same costume, same colours, same outline weight, same lighting. NO-FLIP LOCK - all cells keep that ONE chart facing; no cell is a left-right reversed copy of another cell; the bright near arm and near leg stay the bright pair in EVERY cell and the shadowed far arm and far leg stay the shadowed pair in EVERY cell. The character does not change size and does not move horizontally within its cell. All cells share one ground line at the same height; only the body rises and falls relative to it.';

/* 차트 기반 45도 걷기(walk_basic_quarter) 전용 — 옆면과 같은 "방향 권위 = 차트" 문법.
   좌/우 지시어를 쓰지 않는다: 팀장이 차트를 어느 대각선으로 그리든 결과가 그대로 따라온다. */
const VIEW_QUARTER_CHART =
  'Orthographic three-quarter view, the body turned exactly 45 degrees, camera level and identical distance and zoom in every cell. THE CHART DEFINES THE FACING: the character faces the SAME diagonal direction as the chart\'s mannequins in EVERY cell - even if the character reference image faces the opposite way, the character reference provides ONLY the identity (design, colors, proportions), never the facing. The 45-degree angle is locked - the body NEVER rotates further toward or away from the camera. IDENTICAL IN ALL CELLS: the same character, same face, same head size and shape, same hairstyle with the same LENGTH, VOLUME, SILHOUETTE AREA and strand count, same costume, same colours, same outline weight, same lighting. NO-FLIP LOCK - all cells keep that ONE chart facing; no cell is a left-right reversed copy of another cell; the bright near arm and near leg stay the bright pair in EVERY cell and the shadowed far arm and far leg stay the shadowed pair in EVERY cell. The character does not change size and does not move horizontally. All cells share one ground line at the same height.';

/* ── 시점·불변 블록 (§3 (1)) ───────────────────────────────────────── */
const VIEW_SIDE =
  // NO-FLIP 절: 그림자 팔이 주역 팔로 바뀌는 프레임이 "몸 반전"으로 읽힌다 (2026-08-04 실사고)
  'Orthographic side view, the character faces screen-right in every cell, camera level and identical distance and zoom in every cell. IDENTICAL IN ALL CELLS: the same character, same face, same head size and shape, same hairstyle with the same LENGTH, VOLUME, SILHOUETTE AREA and strand count, same costume, same colours, same outline weight, same lighting. NO-FLIP LOCK - the character NEVER flips left-right between cells: the face keeps pointing toward screen-right in every cell, the BRIGHT near arm and near leg stay the bright pair in EVERY cell, and the shadowed far arm and far leg stay the shadowed pair in EVERY cell - a cell where the shadowed arm becomes the main visible arm while the bright arm disappears, or where the body reads as turned the other way, is WRONG. The character does not change size and does not move horizontally within its cell. All cells share one ground line at the same height; only the body rises and falls relative to it.';

// 정면 대기용 — 걷기 시트(옆모습)가 아니라 기준 포즈(정면)를 레퍼런스로 쓴다
const VIEW_FRONT =
  'Orthographic front view, the character faces the camera directly in every cell, camera level and identical distance and zoom in every cell. IDENTICAL IN ALL CELLS: the same character, same face, same head size and shape, same hairstyle with the same LENGTH, VOLUME, SILHOUETTE AREA and strand count, same costume, same colours, same outline weight, same lighting. The character does not change size and does not move horizontally within its cell. The head never turns to the side and never tilts. All cells share one ground line at the same height.';

const VIEW_TURN =
  'Orthographic view, camera level and identical distance and zoom in every cell. IDENTICAL IN ALL CELLS: the same character, same head size and shape, same hairstyle with the same LENGTH, VOLUME and SILHOUETTE AREA, same costume, same colours, same outline weight, same lighting, same A-pose. Only the facing direction changes between cells. The character does not change size and stands on the same ground line in every cell.';

// 뒷면 대기용 — 기준 세트의 뒷면 프레임을 레퍼런스로 쓴다.
// 앞면 전용 요소 금지: Preserve 목록이 방향 필터를 안 거친 경우에도 뒤에 버클·얼굴을 그리지 않게.
const VIEW_BACK =
  'Orthographic back view, the character faces directly AWAY from the camera in every cell, showing the back of the hair and the back of the outfit, camera level and identical distance and zoom in every cell. IDENTICAL IN ALL CELLS: the same character, same head size and shape, same hairstyle with the same LENGTH, VOLUME, SILHOUETTE AREA and strand count, same costume, same colours, same outline weight, same lighting. Front-only details are NOT visible from behind and must NOT be drawn: no face, no eyes, no facial marks, no chest or collar details, and no belt buckle - a belt seen from behind is a plain band without its buckle. The character does not change size, does not move horizontally, and NEVER turns its head or body toward the camera. All cells share one ground line at the same height.';

// 45도 대기용 — 기준 세트의 45도 프레임을 레퍼런스로 쓴다
const VIEW_QUARTER =
  // NO MIRRORING 절: v3 대각선 라운드에서 프레임마다 몸이 좌우 반전되는 실사고(2026-08-04) 방어
  'Orthographic three-quarter view, the character stays turned exactly 45 degrees toward screen-right in every cell, camera level and identical distance and zoom in every cell. IDENTICAL IN ALL CELLS: the same character, same face, same head size and shape, same hairstyle with the same LENGTH, VOLUME, SILHOUETTE AREA and strand count, same costume, same colours, same outline weight, same lighting. The body NEVER rotates further toward or away from the camera - the 45-degree angle is locked. NO-FLIP LOCK - THIS IS A HARD RULE: every cell keeps this exact same facing; no cell is a left-right reversed copy of another cell. The NEAR shoulder - the one closer to the camera - stays on the screen-LEFT edge of the torso in EVERY cell, and the face keeps looking toward screen-right in EVERY cell. The FAR arm - the shadowed one, matching the chart\'s BLUE arm - stays the shadowed far arm in EVERY cell: the shadow never jumps to the other arm, and the bright near arm never becomes the far one. If a drawn cell shows the near shoulder or the bright arm on the opposite side, that cell is facing the wrong way and is an error. The character does not change size and does not move horizontally. All cells share one ground line at the same height.';

// 뒷45도 대기용 — 기준 세트의 뒷45도(135도) 프레임을 레퍼런스로 쓴다
const VIEW_QUARTER_BACK =
  'Orthographic back three-quarter view, the character stays turned exactly 135 degrees toward screen-right in every cell - the camera sees mostly the BACK with the right shoulder edge, and NO facial features are visible. Camera level and identical distance and zoom in every cell. IDENTICAL IN ALL CELLS: the same character, same head size and shape, same hairstyle with the same LENGTH, VOLUME, SILHOUETTE AREA and strand count, same costume, same colours, same outline weight, same lighting. Front-only details (face, eyes, chest details, a belt buckle) are NOT visible at this angle and must NOT be drawn. The body NEVER rotates toward the camera - the 135-degree angle is locked. NO-FLIP LOCK - THIS IS A HARD RULE: every cell keeps this exact same facing; no cell is a left-right reversed copy of another cell. The NEAR shoulder - the one closer to the camera - stays on the screen-RIGHT edge of the torso in EVERY cell. The FAR arm - the shadowed one, matching the chart\'s BLUE arm - stays the shadowed far arm on the screen-LEFT side in EVERY cell: the shadow never jumps to the other arm. The back of the head faces the camera in every cell; if a drawn cell shows the near shoulder on the left or the shadowed arm on the right, that cell is facing the wrong way and is an error. The character does not change size and does not move horizontally. All cells share one ground line at the same height.';

/* ── 색 구조 차트 편집-치환 블록 (rules "색 구조 가이드" 절 + 편집-치환 구조) ──
   레퍼런스 순서가 핵심이다: [색 격자(첫 번째=포즈 캔버스), 캐릭터(두 번째=정체성)].
   같은 4x2 배치의 격자를 캔버스로 주면 셀별 1:1 포즈 대응이 훨씬 강해진다(실측 — 프레임별
   무릎 들기·보폭이 차트와 일치). 색(빨강=바깥, 파랑=안쪽)이 팔다리 배정을 원천 고정한다. */
const COLOR_GRID_BLOCK =
  // "the same arm positions" 를 지우고 팔은 ARM LAW 관할로 넘겼다 (2026-08-04 팔 정지 사고 —
  // 차트 마네킹 팔이 정지면 그대로 복사돼 팔이 죽는다. 팔은 빨강/파랑 배정만 차트를 따른다).
  'The FIRST reference image is a COLOR-CODED POSE STRUCTURE GRID: a 4-by-2 grid of 8 mannequin walking poses. REDRAW THAT EXACT GRID cell by cell, replacing the mannequin in every cell with the character from the SECOND reference image - the same cell layout, the same pose in each cell, the same leg positions, the same ARM positions, the same foot lift, the same body height per cell. The chart is the single source of the MOTION: every limb goes where that cell\'s mannequin puts it. In the chart RED marks the OUTER arm and OUTER leg (the side nearest to the viewer) and BLUE marks the INNER arm and INNER leg (the far side). This color coding tells you EXACTLY which limb is which in every pose - follow the limb assignments literally, cell by cell, and never flip or swap them. The red and blue are ONLY markers in the chart - draw the character entirely in her own colors, with NO red or blue tinting anywhere, and replace the chart\'s white background with the chroma key background. ' +
  // 실사고 방어: 뒤쪽 셀(5~8)에서 다리 좌우가 뒤집히는 스왑이 가장 흔한 실패다
  // (은발 라운드 미러 행 사고 + 핑크 라운드 6·7번 프레임 스왑 — 둘 다 후반부 셀).
  'CELL-BY-CELL CHECK - before drawing each cell, look at the SAME-NUMBERED cell of the chart and copy its limb assignment exactly: the character\'s near-side limbs (the bright ones) go where that cell\'s RED arm and leg are, and the far-side limbs (the shadowed ones) go where the BLUE ones are. The cells in the bottom row (5, 6, 7, 8) each have their OWN pose in the chart - they are NOT flipped copies or repeats of the top row. Swapping which leg is forward or which leg is lifted in any cell is the single most common error in this task; if a drawn cell disagrees with the chart\'s red/blue assignment for that cell, it is wrong.';

/* 안쪽 팔다리 전체 그림자 — 팀장 지시 "구도감". 추상 지시("darker")는 부분 적용에 그쳤고
   **구체적 색값**으로 지정해야 전 프레임에 적용된다(실측: 스타킹 #D4D4DC, 장갑 #574A73).
   shadowCue 로 캐릭터 의상에 맞는 색값 나열을 넘긴다 — 비우면 예시 값 포함 일반형. */
const INNER_SHADOW_BLOCK = (shadowCue) => {
  const cue = (shadowCue || '').trim().replace(/\s*[.。]\s*$/, '');
  const detail = cue
    ? `(${cue})`
    : '(for example a white stocking becomes light gray about #D4D4DC and a black shoe a deeper flat black; give every inner-limb garment a concrete darker shade of its own colour)';
  // 실사고(reiha) 2건: ① 색값 없이 맡기면 안쪽 다리를 머리색(진청록)으로 통칠,
  // ② "uniformly darker" 를 "한 가지 색으로 통일"로 읽어 살+양말을 회색 한 덩어리로 칠함.
  // → 부위 경계 유지 + 부위별 자기 색 그림자를 명시한다.
  return `FULL INNER-LIMB SHADOW - THIS IS A HARD RULE: the character's ENTIRE INNER LEG and ENTIRE INNER ARM - the limbs matching the BLUE limbs in the chart - are drawn in shadow in EVERY cell. The inner limb KEEPS ITS OWN PART BOUNDARIES - bare skin, legwear, sleeve, glove and shoe each stay visible as separate parts - and EACH PART is darkened to its own shadow tone ${detail}. NEVER paint the whole inner limb as one flat color. Each shadow tone is a darker version of that part's own colour - never green, never teal, never the chroma key colour, and never the hair colour; bare skin in shadow stays a warm rosy skin tone. The same shadow tones repeat identically in every cell. The outer limbs keep the normal bright colors. Never swap which side is dark.`;
};

/* 머리 크기 고정 — 머리 펄스("커졌다 작아졌다")는 세로 방향이 주범
   (실측: 폭 3~8% 안정, 돔 높이 17~25% 출렁 → 이 블록으로 17.1% → 10.5%).
   jitter.headSizePct 로 재고 8% 이하가 목표. */
const HEAD_SIZE_LOCK =
  "HEAD SIZE LOCK - THIS IS A HARD RULE: the head with its hair silhouette is EXACTLY the same size in all cells - same width AND height, as if one head drawing was stamped into every cell. The hair's follow-through is a subtle sideways drift of the tips only - the hair NEVER stretches taller or squashes shorter.";

/* ── 운동 법칙 블록 (§3 (2)) — 프레임 표(또는 차트 블록)보다 먼저 넣는다 ──
   높이 지시는 퍼센트가 아니라 픽셀로 준다(실측: 퍼센트는 결과와 상관관계가 거의 없었다).
   기준값은 캐릭터 키 240px 기준 16/2/4 픽셀 — 실제 charPx 에 비례해 환산한다. */
function walkPixels(charPx) {
  const px = Number(charPx) > 0 ? Math.round(charPx) : 240;
  const scale = (n) => Math.max(1, Math.round((n * px) / 240));
  return { px, low: scale(16), pass: scale(2), high: scale(4) };
}

const MOTION_LAW = (charPx, gait = 'brisk') => {
  const { px, low, high } = walkPixels(charPx);
  // 캐주얼 걷기(팀장 픽셀 레퍼런스)는 진폭·팔 스윙을 줄인다 — 팔은 엉덩이 아래, 스윙 작게
  const bobLow = gait === 'casual' ? Math.max(1, Math.round(low * 0.6)) : low;
  const bobHigh = gait === 'casual' ? Math.max(1, Math.round(high * 0.75)) : high;
  const armClause = gait === 'casual'
    // 2026-08-04 개정 2차: "차트 팔 무시" 자유 조항은 팔 죽은 차트 시절의 응급책이었다 —
    // 이제 활성 차트들(팀장 옆면 8프레임·v4 대각선)에 팔 스윙이 그려져 있으므로
    // **차트 100% 추종**으로 회귀 (팀장 지시 "똑바로 차트의 움직임을 따라서").
    // 근/원측 팔 스왑 금지가 핵심 — 그림자 팔이 주역이 되는 프레임이 "몸 반전"으로 읽힌다.
    ? 'ARM LAW - COPY THE CHART ARMS: the chart\'s mannequin arms already draw the intended relaxed swing. In every cell copy that cell\'s arm pose EXACTLY - the same arm swung forward or back, the same elbow bend, the same amount of each arm visible. STRICT OPPOSITION still holds: the arm opposite the forward leg is the forward one; never let the arm and the leg on the same side swing forward together. NEVER swap which arm is the near one: the BRIGHT near arm stays the fully visible main arm in EVERY cell, and the shadowed far arm only peeks past the body - a cell where the shadowed arm replaces the bright arm as the main visible arm is WRONG.'
    : 'ARM CROSS LAW - THIS IS STRICT: the arms and legs always move in OPPOSITION, exactly as the chart\'s red/blue assignments show. NEVER let the arm and the leg on the same side swing forward together - that is a pacing gait and it is wrong. The arm swing must be large enough to read - the forearm visibly crosses in front of the torso on its forward swing, and the forward arm bends at the elbow (about a right angle) while the backward arm hangs nearly straight.';
  return `MOTION LAW: This is ONE FULL WALK CYCLE built from the four classic animator poses CONTACT, RECOIL, PASSING, HIGH-POINT. BODY HEIGHT oscillates once per step: in this sheet the character is about ${px} pixels tall - the RECOIL poses are drawn with the head about ${bobLow} PIXELS LOWER than the CONTACT poses, and the HIGH-POINT poses about ${bobHigh} PIXELS HIGHER than the CONTACT poses. The descent is gradual and the rise is sudden - the head path is a triangle-shaped wave, never a smooth even sine. FOOT ROLL LAW - every step rolls through the foot: the front foot lands HEEL FIRST WITH THE TOES LIFTED OFF THE GROUND, flattens on the RECOIL pose as the knee bends to absorb the weight, stays flat through PASSING, then on HIGH-POINT the HEEL LIFTS HIGH and only the toes push the ground before the foot swings forward. A foot is never pasted flat onto the ground in the frame where it lands and never leaves the ground flat - flat-footed stomping in every frame is what makes a walk look like a robot sliding. GROUND LAW - the cycle is animated in place, so while a foot is planted it slides BACKWARD under the body by an EQUAL distance every frame until it lifts; it never sticks to one spot while the body pattern advances. ${armClause} The hair and the skirt follow ONE FRAME BEHIND the body as a subtle sideways drift of the tips and hem only, keeping their shape.`;
};

/* NEAR-SIDE VISIBILITY LAW (§3 (2) 하단)
   실측: 해부학 라벨("right arm forward")보다 **실루엣에 무엇이 보이는가**로 쓰는 편이 잘 듣는다. */
const NEAR_SIDE_LAW = (cue) =>
  cue
    ? `NEAR-SIDE VISIBILITY LAW: judge the arms by what is VISIBLE in the silhouette, not by anatomical labels. On the cells where the chart's RED (outer) leg swings FORWARD, ${cue} must be HIDDEN BEHIND THE HIP and not visible at all. Only on the cells where the BLUE (inner) leg swings forward does ${cue} appear clearly IN FRONT OF THE HIP AND THIGH. Apply this cell by cell.`
    : '';

/* ── 걷기 프레임 배정 — 차트 포즈 수에 따라 둘 중 하나 ──────────────
   7포즈 차트(빠른걸음): 8번 그림이 1번과 중복이라 서버가 keep:7 로 제외 —
   프레임 8은 "포즈7 → 포즈1 복귀 중간 동작". 8포즈 차트(일반 걷기): 완전 루프라 1:1 복사. */
const FRAMES_CHART = (charPx, chartPoses = 7) => {
  const { low, high } = walkPixels(charPx);
  const rhythm = `Keep the chart's rhythm in pixels: the lowest (RECOIL) cells sit about ${low} pixels lower and the highest (HIGH-POINT) cells about ${high} pixels higher than the CONTACT cells.`;
  // 8포즈: "두 걸음" 구조를 명시한다 — 색 스왑만으로 미러를 인코딩한 차트에서 모델이
  // 같은 다리 앞 포즈를 4번 복제한 실사고(2026-08-04 45도 라운드) 방어.
  if (chartPoses === 8) {
    return `Frames 1 to 8 of the grid copy the chart's poses 1 to 8 in order, one to one: the same leg positions, the same ARM positions, the same foot lift, the same body height in each cell. The cycle is TWO STEPS: in frames 1 to 4 one leg leads, and in frames 5 to 8 THE OTHER leg leads through the same contact-recoil-passing-highpoint sequence - frame 5 shows the opposite leg forward from frame 1, frame 6 answers frame 2 with the legs' roles traded, and so on, at the stance widths the chart itself shows in each cell. The BODY FACING NEVER CHANGES between frames: frames 5 to 8 are the other leg stepping, not the body turned the other way. NO two frames in the sheet may be identical or near-identical: if a frame looks like a copy of another frame, the legs in one of them are on the wrong sides. The chart is a COMPLETE loop - frame 8 flows straight back into frame 1. ${rhythm}`;
  }
  return `Frames 1 to 7 of the grid copy the chart's poses 1 to 7 in order: the same leg positions, the same foot lift, the same body height in each cell. The arms keep the chart's red/blue side assignment per cell but are drawn with the full visible swing described in the ARM LAW, even where the chart's mannequin arms barely move. Frame 8 is the smooth in-between that returns from pose 7 back to pose 1 so the loop closes. ${rhythm}`;
};

/* ── 걷기 8프레임 프레임 표 — 색 구조 차트가 없을 때의 폴백 (§ 걷기 8프레임) ── */
const FRAMES_WALK8 = (charPx) => {
  const { low, pass, high } = walkPixels(charPx);
  return `Frame 1 - CONTACT, LEFT leg forward. Height MID. Both legs straight at maximum separation: the left heel just touches the ground with the TOES LIFTED, the right leg is extended back with only the toes on the ground and the heel high. Near right arm swings forward, elbow bent about a right angle, its hand visible in front of the chest; far left arm hangs back nearly straight. Frame 2 - RECOIL. Height LOW, head ${low} pixels lower than Frame 1, the lowest of the cycle. The left foot is now FLAT and the left knee is BENT, compressed under the body's full weight; the right foot has just peeled off the ground toe-last. Arms sweep in past the hips. Frame 3 - PASSING. Head ${pass} pixels higher than Frame 1 and rising. The left support leg is straight and vertical, foot flat directly under the body; the bent right leg passes it with the foot just clear of the ground, toes pointing slightly down. Arms hang near the sides. Frame 4 - HIGH-POINT. Head ${high} pixels higher than Frame 1, the highest of the cycle. The left HEEL LIFTS HIGH so only the left toes push the ground; the right leg has swung ahead with the knee raised, shin angled down, ready to land heel-first. Arms begin opening toward the next contact. Frame 5 - CONTACT, RIGHT leg forward. Exact mirror of Frame 1 with the limbs swapped: right heel down with toes lifted, left toes back with heel high, far LEFT arm forward bent at the elbow (partly hidden behind the torso), near right arm swung fully back behind the hip. Frame 6 - RECOIL, mirror of Frame 2: right foot flat, right knee bent, lowest head. Frame 7 - PASSING, mirror of Frame 3. Frame 8 - HIGH-POINT, mirror of Frame 4: right heel high pushing off, left leg swinging ahead so the loop returns seamlessly to Frame 1. LOOP CLOSURE: Frame 8's swinging left leg and hair arc must land exactly on Frame 1's contact pose.`;
};

/* ── 금지 블록 (§3 (4)) — 반드시 붙인다 ───────────────────────────── */
const FORBID_WALK =
  'DO NOT draw the hair as a rigid frozen shape - it must move. But do not change its length, volume, silhouette area, colour or strand count between frames; it is the same shape slid and bent, never redrawn. No random flicking, no strands appearing or disappearing, no wind. Do not make the hair or the cape trail out in a large flap - this is a WALK, not a run: the cape hangs near-vertical and only undulates. No motion blur, no speed lines, no ghosting, no trails. Do not change the head size or the character\'s scale between cells. Do not draw both feet flat on the ground in the same frame.';

/* 공격·대기·4방향은 걷기 전용 문장(발·망토)이 필요 없다 — 대신 정체성 고정만 강하게 건다 */
const FORBID_GENERIC =
  'Do not change the hairstyle: same length, volume, silhouette area, colour and strand count in every cell; it is the same shape slid and bent, never redrawn. No motion blur, no speed lines, no ghosting, no trails. Do not change the head size or the character\'s scale between cells. Do not add or remove any accessory.';

/* ── 비율 보정 블록 (§3 (5) + rules 3.5~3.7) — 동작 프롬프트 끝에 붙인다 ── */
const ARTICULATE =
  'Limbs are thick, tapered and simplified - but the walk still ARTICULATES: on the RECOIL pose the loaded front leg reads as visibly compressed and bent even as a blocked mass, and on the HIGH-POINT pose the back heel lifts high with only the toe touching. The FOOT ROLL survives simplification - heel-strike with the toes up and toe push-off must both be readable even on small blocked feet; that articulation, not detail, is what separates a walk from a robot slide. The stride is short: horizontal foot travel is about half what a realistic figure would take relative to its own height. The head translates vertically only - no head rotation or tilt within the cycle. No spine bend and no visible torso twist; counter-rotation is suggested only by the near arm being larger and lighter than the far arm.';

const PROPORTION_BLOCKS = {
  sd: `CHIBI ADJUSTMENTS: The head is one third to one half of the total height and there is no neck. ${ARTICULATE} Keep the body-height travel to about 5 percent of the total height - exaggerate the SHAPE of the bob, slow fall and sudden rise, never its size, because too much amplitude reads as hopping instead of walking.`,
  mini: `CHIBI ADJUSTMENTS: The head is HALF of the total height - as tall as the whole body beneath it - and there is no neck at all. The body, arms and legs are short and stubby with mitten-like hands. ${ARTICULATE} Keep the body-height travel to about 5 percent of the total height - exaggerate the SHAPE of the bob, slow fall and sudden rise, never its size, because too much amplitude reads as hopping instead of walking.`,
  h4: `PROPORTION LOCK: exactly 4 heads tall in every cell - the head is ONE QUARTER of the total height, with a defined torso, arms with visible elbows and legs with visible knees. The elbows and knees articulate clearly through the cycle while the head fraction never changes between cells.`,
  h6: `PROPORTION LOCK: about 6 heads tall in every cell - near-realistic anime proportions with long limbs and clear elbows and knees. Keep the original costume detail; the head fraction never changes between cells.`,
};

/* ── Preserve exactly (양쪽 규칙 공통, §5) ─────────────────────────
   레퍼런스는 방향만 잡아준다. 색과 소품은 글로 못 박지 않으면 바뀐다
   (실사고: 은발 메이드 걷기를 요청했는데 검정머리에 장갑·초커가 사라진 캐릭터가 나왔다). */
const preserve = (features) => {
  const f = (features || '').trim().replace(/\s*[.。]\s*$/, '');
  return f ? `Preserve exactly: ${f}.` : '';
};

/* ── 공개 API ─────────────────────────────────────────────────────── */

/** 스탠딩 원화 → 기준 4방향 세트(2x2 턴어라운드) 프롬프트 (proportion: 'sd' | 'mini' | 'h4' | 'h6')
 *  withStyleAnchor: 두 번째 레퍼런스로 스타일 앵커를 붙일 때 true — refs 순서 [스탠딩, 앵커] 고정 */
export function buildBasePrompt({ features, chroma = 'green', proportion = 'sd', withStyleAnchor = false } = {}) {
  const v = BASE_VARIANTS[proportion] || BASE_VARIANTS.sd;
  return [v.header, v.keep, BASE_TURNAROUND_GRID(chroma), withStyleAnchor ? STYLE_ANCHOR_BLOCK : '', preserve(features), v.negatives]
    .filter(Boolean)
    .join(' ');
}

/**
 * 동작 프롬프트.
 * 순서는 규칙 §5 그대로: [기술 블록] → [시점] → (차트/운동 법칙) → [프레임 배정] → [금지] → (비율) → [Preserve exactly]
 * @param {object} o
 * @param {object} o.anim          lib/anims.js 의 동작 정의
 * @param {string} o.features      기준 포즈에 저장된 "꼭 지킬 특징"
 * @param {string} o.chroma        'green' | 'magenta'
 * @param {number} o.charPx        앞선 시트의 캐릭터 키 — 픽셀 높이 지시의 기준
 * @param {string} o.weapon        공격 전용. 비우면 맨손 프롬프트가 나간다
 * @param {string} o.nearCue       걷기 전용. 근측(바깥) 팔의 식별 표지 (예: "the purple glove")
 * @param {string} o.shadowCue     걷기 전용. 안쪽 팔다리 그림자의 구체 색값 나열
 * @param {boolean} o.withColorGrid 걷기에서 색 구조 격자를 첫 번째 레퍼런스로 붙일 때 true (v2 기본)
 * @param {string} o.proportion    'sd' | 'mini' | 'h4' | 'h6' — 기준 포즈에 저장된 값을 따른다
 */
export function buildAnimPrompt({ anim, features, chroma = 'green', charPx, weapon, nearCue, shadowCue, withColorGrid, proportion = 'sd' } = {}) {
  const tech = TECH_BLOCK({ cols: anim.cols, rows: anim.rows, frames: anim.frames, chromaKey: chroma });
  const parts = [tech];

  // 빠른걸음(walk)은 v1 검증 원문 동결 경로만 탄다 — 걷기 개정이 절대 번지지 않게 (2026-08-05)
  const LEGACY = anim.key === 'walk';
  const VIEWS = { front: VIEW_FRONT, back: VIEW_BACK, quarter: VIEW_QUARTER, quarterBack: VIEW_QUARTER_BACK, side: VIEW_SIDE };
  // 차트 걷기(walk_basic·walk_basic_quarter)는 방향을 차트에 위임한다 — 좌/우 지시어 없는 전용 블록
  const CHART_VIEWS = { walk_basic: VIEW_SIDE_CHART, walk_basic_quarter: VIEW_QUARTER_CHART };
  parts.push(anim.key === 'turn' ? VIEW_TURN : LEGACY ? VIEW_SIDE_V1 : CHART_VIEWS[anim.key] || VIEWS[anim.view] || VIEW_SIDE);

  if (anim.key === 'walk' || anim.chartPoses) {
    // 걷기류 공통 — chartPoses: 7(빠른걸음, keep:7) | 8(일반 걷기, 완전 루프). gait 는 팔 스윙·진폭.
    // walk_basic_quarter / walk_basic_quarter_back 도 같은 캐주얼 보행 (팀장 픽셀 레퍼런스 계열).
    const gait = anim.key.startsWith('walk_basic') ? 'casual' : 'brisk';
    if (withColorGrid) {
      // 편집-치환: 색 격자가 첫 번째 레퍼런스(포즈 캔버스), 캐릭터가 두 번째(정체성)
      parts.push(LEGACY ? COLOR_GRID_BLOCK_V1 : COLOR_GRID_BLOCK);
      parts.push(INNER_SHADOW_BLOCK(shadowCue));
      parts.push(HEAD_SIZE_LOCK);
      parts.push(MOTION_LAW(charPx, gait));
      const near = (LEGACY ? NEAR_SIDE_LAW_V1 : NEAR_SIDE_LAW)((nearCue || '').trim());
      if (near) parts.push(near);
      parts.push(LEGACY ? FRAMES_CHART_V1(charPx) : FRAMES_CHART(charPx, anim.chartPoses || 7));
    } else {
      parts.push(MOTION_LAW(charPx, gait));
      const near = (LEGACY ? NEAR_SIDE_LAW_V1 : NEAR_SIDE_LAW)((nearCue || '').trim());
      if (near) parts.push(near);
      parts.push(FRAMES_WALK8(charPx));
    }
    parts.push(FORBID_WALK);
    parts.push(PROPORTION_BLOCKS[proportion] || PROPORTION_BLOCKS.sd);
  } else {
    if (anim.key === 'attack') parts.push(FRAMES_ATTACK(weapon));
    else if (anim.key === 'turn') parts.push(FRAMES_TURN);
    else {
      const idleNote = {
        front: ' Both shoulders stay level and symmetrical - this is a straight-on front view, so the breathing reads as the chest and shoulders rising and falling, not as a twist.',
        back: ' Seen from behind, the breathing reads as the shoulders and the back gently rising and falling; the back of the hair keeps its exact silhouette and the head never turns around.',
        quarter: ' The 45-degree facing is identical in every frame - breathing must never read as the body rotating; only the chest and shoulders rise and fall.',
        quarterBack: ' The 135-degree back three-quarter facing is identical in every frame - breathing reads as the shoulders and back gently rising and falling, the body never rotates, and no facial features ever appear.',
      }[anim.view] || '';
      parts.push(FRAMES_IDLE + idleNote);
    }
    parts.push(FORBID_GENERIC);
  }

  const p = preserve(features);
  if (p) parts.push(p);
  return parts.join(' ');
}

/* ── 공격 프레임 표 (§ 공격) ───────────────────────────────────────
   열린 문제였던 "무기 창작"(무기 없는 캐릭터에 도끼를 그려 줌)을 막기 위해 무기를 명시한다. */
const FRAMES_ATTACK = (weapon) => {
  const w = (weapon || '').trim();
  if (!w) {
    // 무기가 없는 캐릭터 — 규칙 §공격 각주대로 weapon 을 주먹·발차기로 바꾼다
    return 'The character is EMPTY-HANDED and carries NO WEAPON of any kind - do not invent, add or draw any sword, axe, staff, knife or tool in this sheet. This is a bare-handed punch. Frame 1: standing ready, both fists raised in a guard near the chest. Frame 2: winding up, torso rotating back and the near fist pulled back beside the hip. Frame 3: the fist at its furthest back point, weight on the back foot, shoulder loaded. Frame 4: driving forward, the arm half extended, front foot planted. Frame 5: contact, the near arm fully extended forward at chest height, body leaning into the strike. Frame 6: recovery, the fist pulling back toward the guard pose.';
  }
  return `The character wields ${w} and NOTHING ELSE - do not invent, add or substitute any other weapon, and do not change its size, shape or colour between frames. Frame 1: standing ready, ${w} lowered. Frame 2: winding up, torso rotating back and ${w} raised behind. Frame 3: ${w} at its highest point, weight on the back foot. Frame 4: swinging forward, ${w} horizontal, front foot planted. Frame 5: contact, ${w} fully extended forward, body leaning into the strike. Frame 6: recovery, ${w} lowering back toward the ready pose.`;
};

/* ── 대기 프레임 표 (§ 대기) ──────────────────────────────────────── */
const FRAMES_IDLE =
  'This is a standing idle breathing loop, not a walk. Both feet stay planted in exactly the same position in all frames. Frame 1: neutral standing. Frame 2: chest rises slightly. Frame 3: highest point of the breath, shoulders slightly raised. Frame 4: chest lowers. Frame 5: lowest point, shoulders slightly dropped. Frame 6: returning to neutral so the loop is seamless. Only the torso and shoulders move; the head, hair, arms and legs are identical in every frame.';

/* ── 4방향 턴어라운드 프레임 표 ──────────────────────────────────── */
const FRAMES_TURN =
  'This is a four-direction turnaround, not an animation. The pose is an identical relaxed A-pose in all four cells and only the facing direction changes. Frame 1: facing the camera, front view. Frame 2: side view facing screen-right, the same A-pose seen from the right side. Frame 3: back view, facing directly away from the camera, showing the back of the hair and the back of the costume. Frame 4: side view facing screen-left, the exact mirror of Frame 2. The head height, the shoulder height and the feet position are identical in all four cells.';

/** 화면에서 "이 격자를 만들 때 이 이미지들을 첨부하세요" 안내에 쓰는 라벨 */
export const REF_LABEL = { base: '기준 포즈', walk: '걷기 시트', standing: '스탠딩 원화', guide: '색 구조 차트' };

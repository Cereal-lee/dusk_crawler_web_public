import PXF from './dusk_engine.mjs';

export const LIMITS = Object.freeze({ bytes: 256 * 1024, nodes: 64, links: 128, keyframes: 64, frames: 32, maxSize: 128 });
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const fail = message => { throw new Error(message); };
const number = (v, min, max, label) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${label}: 허용 범위를 벗어났습니다.`);
  return v;
};
const integer = (v, min, max, label) => {
  number(v, min, max, label); if (!Number.isInteger(v)) fail(`${label}: 정수가 필요합니다.`); return v;
};
const text = (v, max, label) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail(`${label}을 확인해주세요.`); return v;
};
// Older authored graphs carry easing names the engine treats as linear.
const ease = v => { if (v !== undefined && (typeof v !== 'string' || v.length > 32)) fail('잘못된 이징입니다.'); return own(PXF.EASE, v ?? 'linear') ? v ?? 'linear' : 'linear'; };

function inspect(raw) {
  let fields = 0;
  const walk = (v, depth) => {
    if (++fields > 20000 || depth > 20) fail('JSON 구조가 너무 복잡합니다.');
    if (typeof v === 'number' && !Number.isFinite(v)) fail('유한한 숫자만 사용할 수 있습니다.');
    if (typeof v === 'string' && v.length > 65536) fail('JSON 문자열이 너무 깁니다.');
    if (v && typeof v === 'object') for (const k of Object.keys(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(k)) fail('허용되지 않는 JSON 키입니다.');
      walk(v[k], depth + 1);
    }
  };
  walk(raw, 0);
  let encoded;
  try { encoded = JSON.stringify(raw); } catch { fail('JSON으로 읽을 수 없는 데이터입니다.'); }
  if (!encoded || new TextEncoder().encode(encoded).length > LIMITS.bytes) fail('JSON 파일은 256KB 이하여야 합니다.');
}

function parameter(v, q, frames) {
  const label = q.label || q.n;
  if (['num', 'int', 'seed'].includes(q.t)) {
    const val = value => number(value, q.min, q.max, label);
    if (typeof v === 'number') return val(v);
    if (q.t === 'seed' || !object(v)) fail(`${label}: 숫자가 필요합니다.`);
    if (own(v, 'k')) {
      if (Object.keys(v).some(k => k !== 'k') || !Array.isArray(v.k) || !v.k.length || v.k.length > LIMITS.keyframes) fail('키프레임은 1–64개여야 합니다.');
      let previous = -1;
      return { k: v.k.map(k => {
        if (!Array.isArray(k) || k.length < 2 || k.length > 3) fail('잘못된 키프레임입니다.');
        const f = number(k[0], 0, frames - 1, '키프레임');
        if (f <= previous) fail('키프레임은 중복 없이 시간순이어야 합니다.');
        previous = f; return [f, val(k[1]), ease(k[2])];
      }) };
    }
    if (!own(v, 'a') || !own(v, 'b') || Object.keys(v).some(k => !['a', 'b', 'e', 't0', 't1'].includes(k))) fail('잘못된 애니메이션 값입니다.');
    const t0 = number(v.t0 ?? 0, 0, 1, '시작 시간'), t1 = number(v.t1 ?? 1, 0, 1, '종료 시간');
    if (t0 > t1) fail('종료 시간은 시작 시간 이후여야 합니다.');
    return { a: val(v.a), b: val(v.b), e: ease(v.e), t0, t1 };
  }
  if (q.t === 'sel') { if (!q.opt.includes(v)) fail(`${label}: 알 수 없는 옵션입니다.`); return v; }
  if (q.t === 'bool') { if (typeof v !== 'boolean') fail(`${label}: 참/거짓 값이 필요합니다.`); return v; }
  if (q.t === 'color') { if (typeof v !== 'string' || !/^#[\da-f]{6}$/i.test(v)) fail('색상은 #RRGGBB 형식이어야 합니다.'); return v.toLowerCase(); }
  if (q.t === 'palette') {
    if (!Array.isArray(v) || !v.length || v.length > Math.min(q.max || 32, 32) || !v.every(c => typeof c === 'string' && /^#[\da-f]{6}$/i.test(c))) fail('팔레트는 최대 32개의 색상이어야 합니다.');
    return v.map(c => c.toLowerCase());
  }
  fail('허용되지 않는 파라미터입니다.');
}

/** A fresh allowlisted graph, shared by local import and server publication. */
export function normalizeGraph(raw) {
  inspect(raw);
  if (!object(raw) || !object(raw.settings) || !Array.isArray(raw.nodes) || !Array.isArray(raw.links)) fail('PXF 그래프 JSON이 필요합니다.');
  const s = raw.settings;
  if (![32, 48, 64, 96, 128].includes(s.size)) fail('캔버스 크기는 32·48·64·96·128px 중 하나여야 합니다.');
  const settings = { size: s.size, frames: integer(s.frames, 1, LIMITS.frames, '프레임 수'), fps: number(s.fps, 1, 60, 'FPS'), loop: s.loop ?? false };
  if (typeof settings.loop !== 'boolean') fail('루프 설정을 확인해주세요.');
  if (!raw.nodes.length || raw.nodes.length > LIMITS.nodes || raw.links.length > LIMITS.links) fail('노드는 1–64개, 연결은 128개 이하여야 합니다.');
  const ids = new Map();
  const nodes = raw.nodes.map(n => {
    if (!object(n) || typeof n.type !== 'string' || !own(PXF.DEFS, n.type)) fail('알 수 없는 노드입니다.');
    const id = text(n.id, 64, '노드 ID');
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || ids.has(id)) fail('노드 ID는 중복 없는 영문·숫자여야 합니다.');
    const defs = PXF.DEFS[n.type].params, input = n.params ?? {};
    if (!object(input)) fail('노드 파라미터를 확인해주세요.');
    // Ignore legacy extras exactly as the engine does; only defined fields survive.
    const params = Object.fromEntries(defs.map(q => [q.n, parameter(own(input, q.n) ? input[q.n] : q.d, q, settings.frames)]));
    const node = { id, type: n.type, x: number(n.x ?? 0, -100000, 100000, '노드 X'), y: number(n.y ?? 0, -100000, 100000, '노드 Y'), params };
    ids.set(id, node); return node;
  });
  if (nodes.filter(n => n.type === 'Output').length !== 1) fail('Output 노드가 정확히 하나 필요합니다.');
  const ports = new Set();
  const links = raw.links.map(l => {
    if (!object(l) || !ids.has(l.f) || !ids.has(l.t) || ids.get(l.f).type === 'Output') fail('잘못된 노드 연결입니다.');
    const p = integer(l.p, 0, PXF.DEFS[ids.get(l.t).type].in.length - 1, '입력 포트');
    const key = `${l.t}:${p}`; if (ports.has(key)) fail('한 입력 포트에는 하나만 연결할 수 있습니다.'); ports.add(key);
    return { f: l.f, t: l.t, p };
  });
  const visiting = new Set(), done = new Set();
  const visit = id => {
    if (visiting.has(id)) fail('순환 연결은 지원하지 않습니다.');
    if (done.has(id)) return;
    visiting.add(id); for (const l of links) if (l.t === id) visit(l.f);
    visiting.delete(id); done.add(id);
  };
  for (const id of ids.keys()) visit(id);
  if (!links.some(l => l.t === nodes.find(n => n.type === 'Output').id)) fail('Output에 입력을 연결해주세요.');
  const inputGame = raw.game ?? {};
  if (!object(inputGame)) fail('재생 설정을 확인해주세요.');
  const pivot = inputGame.pivot ?? [.5, .5];
  if (!Array.isArray(pivot) || pivot.length !== 2) fail('기준점은 X·Y 두 값이어야 합니다.');
  const blend = inputGame.blend ?? 'normal'; if (!['normal', 'add'].includes(blend)) fail('잘못된 합성 방식입니다.');
  const game = { style: 'hero-pixel-v1', pivot: pivot.map(x => number(x, 0, 1, '기준점')), logicalSize: number(inputGame.logicalSize ?? settings.size, 8, 320, '게임 크기'), blend, referenceCell: 62, durationMs: settings.frames / settings.fps * 1000 };
  if (inputGame.impactFrame !== undefined) game.impactFrame = integer(inputGame.impactFrame, 0, settings.frames - 1, '명중 프레임');
  if (inputGame.authoredCut !== undefined) { if (typeof inputGame.authoredCut !== 'boolean') fail('종료 설정을 확인해주세요.'); game.authoredCut = inputGame.authoredCut; }
  if (inputGame.authoredEdgePixels !== undefined) game.authoredEdgePixels = integer(inputGame.authoredEdgePixels, 0, 32, '경계 허용량');
  return { format: 'pxf.graph@1', name: text(raw.name ?? '내 이펙트', 60, '이펙트 이름'), settings, nodes, links, game };
}

/** Stable output traversal ignores display positions, names, IDs and unused nodes. */
export function graphFingerprintInput(graph) {
  const g = normalizeGraph(graph), indices = new Map(), records = [];
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const visit = id => {
    if (indices.has(id)) return indices.get(id);
    const n = byId.get(id), inputs = g.links.filter(l => l.t === id).sort((a, b) => a.p - b.p).map(l => [l.p, visit(l.f)]);
    const index = records.length; indices.set(id, index);
    records.push({ type: n.type, params: n.params, inputs }); return index;
  };
  visit(g.nodes.find(n => n.type === 'Output').id);
  return JSON.stringify({ settings: g.settings, game: g.game, nodes: records });
}

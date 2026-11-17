/**
 * Guide de sécurité — animation « Les 3 gestes » (se baisser, s'abriter, s'agripper).
 * Personnage articulé dessiné en SVG : chaque posture est un jeu d'angles (épaules, coudes, hanches, genoux),
 * les mains sont placées par cinématique inverse, et le moteur interpole les postures (aucune bibliothèque).
 * Accessibilité : bouton pause ; pas d'annonce vocale en lecture automatique ; images fixes si l'utilisateur
 * a demandé moins d'animations (prefers-reduced-motion) ; l'animation s'arrête quand elle n'est plus visible.
 */

type Expr = 'calm' | 'alarm' | 'focus' | 'relief';
type PoseKey = 'stand' | 'alarm' | 'drop' | 'cover' | 'hold' | 'end';
type Pose = Record<string, number>;
type HandSpec = { abs?: [number, number]; head?: [number, number]; bend?: number };
type PoseSpec = { handN?: HandSpec; handF?: HandSpec; [angle: string]: number | HandSpec | undefined };
interface Phase { id: string; dur: number; pose: PoseKey; expr: Expr; tw: number; badge: string; cls?: string; gait?: boolean; zoom?: boolean }

const NS = 'http://www.w3.org/2000/svg';

// ------------------------------------------------------------------ dessin du personnage
const FACE = `
  <g class="fv e-open" fill="var(--ta-hair)"><ellipse cx="5.5" cy="-16" rx="1.6" ry="2.1"/><ellipse cx="11.5" cy="-16" rx="1.5" ry="2"/></g>
  <g class="fv e-wide"><circle cx="5.5" cy="-16" r="2.6" fill="#fff"/><circle cx="11.5" cy="-16" r="2.4" fill="#fff"/><circle cx="6" cy="-16" r="1.3" fill="var(--ta-hair)"/><circle cx="12" cy="-16" r="1.2" fill="var(--ta-hair)"/></g>
  <g class="fv e-squint" fill="none" stroke="var(--ta-hair)" stroke-width="1.4" stroke-linecap="round"><path d="M3.8 -15.6 q1.8 -1.5 3.5 0"/><path d="M10 -15.6 q1.6 -1.4 3.1 0"/></g>
  <g class="fv e-happy" fill="none" stroke="var(--ta-hair)" stroke-width="1.4" stroke-linecap="round"><path d="M3.8 -15.2 q1.8 -2.4 3.5 0"/><path d="M10 -15.2 q1.6 -2.3 3.1 0"/></g>
  <g class="fv b-normal" stroke="var(--ta-hair)" stroke-width="1.5" stroke-linecap="round"><path d="M3.4 -20.6 l4 -.6"/><path d="M9.8 -21 l3.6 .3"/></g>
  <g class="fv b-up" stroke="var(--ta-hair)" stroke-width="1.5" stroke-linecap="round"><path d="M3.4 -22.4 l4 -1.4"/><path d="M9.8 -23.6 l3.6 .9"/></g>
  <g class="fv b-focus" stroke="var(--ta-hair)" stroke-width="1.6" stroke-linecap="round"><path d="M3.4 -20 l4 1"/><path d="M9.8 -19 l3.6 -1.2"/></g>
  <path class="fv m-smile" d="M7.2 -9.4 q3 2.4 6 -.2" fill="none" stroke="#6b2d20" stroke-width="1.4" stroke-linecap="round"/>
  <ellipse class="fv m-o" cx="10" cy="-8.6" rx="2.1" ry="2.7" fill="#6b2d20"/>
  <path class="fv m-line" d="M7.6 -8.8 h5" stroke="#6b2d20" stroke-width="1.5" stroke-linecap="round"/>
  <path class="fv m-relief" d="M6.6 -9.6 q3.6 3.4 7.2 0" fill="#6b2d20" stroke="#6b2d20" stroke-width="1" stroke-linejoin="round"/>`;
const SHOE = '<path d="M-6 -3 C-6 -6 -2 -6 1 -6 H5 C11 -6 15 -2 15 2 V4 H-6Z" fill="var(--ta-shoe)"/>';
const PARTS: Record<string, string> = {
  faF: '<rect x="-4.3" y="-3" width="8.6" height="25" rx="4.3" fill="var(--ta-skin-d)"/><ellipse cx="0" cy="24" rx="5" ry="5.8" fill="var(--ta-skin-d)"/>',
  uaF: '<rect x="-5.4" y="-5.5" width="10.8" height="33" rx="5.4" fill="var(--ta-shirt-d)"/>',
  thF: '<rect x="-7.5" y="-6" width="15" height="40" rx="7.5" fill="var(--ta-pants-d)"/>',
  shF: '<rect x="-6.2" y="-4" width="12.4" height="37" rx="6.2" fill="var(--ta-pants-d)"/>',
  ftF: SHOE,
  torso: `<path d="M-11 4 C-13 -12 -15 -28 -15 -37 C-15 -44 -10 -48 -3 -48 H3 C10 -48 15 -44 15 -37 C15 -28 13 -12 11 4 Z" fill="var(--ta-shirt)"/>
    <path d="M-11 4 C-13 -12 -15 -28 -15 -37 C-15 -42 -13 -46 -10 -47 C-9 -30 -7 -12 -5 4Z" fill="var(--ta-shirt-d)" opacity=".55"/>
    <path d="M-4.5 -48 L0 -41.5 L4.5 -48" fill="var(--ta-shirt-l)" opacity=".9"/>
    <circle cx="1" cy="-34" r=".9" fill="var(--ta-shirt-d)"/><circle cx="1.2" cy="-25" r=".9" fill="var(--ta-shirt-d)"/><circle cx="1.3" cy="-16" r=".9" fill="var(--ta-shirt-d)"/>
    <rect x="-11.6" y="-1.5" width="23.2" height="4.5" rx="1.8" fill="var(--ta-belt)"/>`,
  head: `<rect x="-4.5" y="-8" width="9" height="11" rx="3" fill="var(--ta-skin-d)"/>
    <circle cx="1.5" cy="-16" r="13.5" fill="var(--ta-skin)"/>
    <ellipse cx="-7.5" cy="-15" rx="3" ry="4" fill="var(--ta-skin-d)"/>
    <path d="M-12.5 -15 C-13.5 -28 -3 -33.5 5 -31.5 C12.5 -30 16.5 -25 15.5 -20 C11 -23.5 5 -23.5 1 -21.5 C-2 -20 -4.5 -17 -5.5 -12 C-8 -13 -11 -13 -12.5 -15Z" fill="var(--ta-hair)"/>
    <path d="M14.4 -14.6 q2.6 2.4 -.3 3.6" fill="none" stroke="var(--ta-skin-d)" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="12.4" cy="-10.8" r="2.3" fill="#e0816c" opacity=".35"/>${FACE}`,
  thN: '<rect x="-7.5" y="-6" width="15" height="40" rx="7.5" fill="var(--ta-pants)"/>',
  shN: '<rect x="-6.2" y="-4" width="12.4" height="37" rx="6.2" fill="var(--ta-pants)"/><rect x="-6.2" y="24" width="12.4" height="4" fill="var(--ta-pants-d)" opacity=".5"/>',
  ftN: `${SHOE}<path d="M-6 2.5 H15" stroke="#555" stroke-width="1.2"/>`,
  faN: '<rect x="-4.3" y="-3" width="8.6" height="25" rx="4.3" fill="var(--ta-skin)"/><ellipse cx="0" cy="24" rx="5.2" ry="6" fill="var(--ta-skin)"/><ellipse cx="3.6" cy="21.5" rx="2" ry="3" fill="var(--ta-skin-d)" opacity=".6"/>',
  uaN: '<rect x="-5.6" y="-5.5" width="11.2" height="33" rx="5.6" fill="var(--ta-shirt)"/><rect x="-5.6" y="23" width="11.2" height="4.5" rx="2" fill="var(--ta-shirt-d)"/>',
};
const ORDER = ['thF', 'shF', 'ftF', 'faF', 'uaF', 'torso', 'head', 'thN', 'shN', 'ftN', 'faN', 'uaN'];
type Parts = Record<string, SVGGElement>;

function buildChar(g: SVGGElement): Parts {
  const parts: Parts = {};
  for (const k of ORDER) {
    const p = document.createElementNS(NS, 'g');
    p.innerHTML = PARTS[k];
    g.appendChild(p);
    parts[k] = p;
  }
  return parts;
}

// ------------------------------------------------------------------ cinématique (degrés ; 0 = membre vers le bas)
const L1 = 24;
const L2 = 24;
const R = Math.PI / 180;
const rot = (a: number, [x, y]: number[]): [number, number] => {
  const c = Math.cos(a * R);
  const s = Math.sin(a * R);
  return [x * c - y * s, x * s + y * c];
};
const add = (a: number[], b: number[]): [number, number] => [a[0] + b[0], a[1] + b[1]];
const dirAngle = (dx: number, dy: number) => Math.atan2(-dx, dy) / R;
const norm = (a: number) => ((a + 540) % 360) - 180;
const DEFAULT: Pose = { x: 110, y: 158, pelvis: 0, torso: 0, head: 0, uaN: 0, faN: 0, uaF: 0, faF: 0, thN: 0, shN: 0, ftN: 0, thF: 0, shF: 0, ftF: 0, shW: 22, shX: 2 };
const shoulderOf = (p: Pose) => add([p.x, p.y], rot(p.pelvis + p.torso, [0, -40]));
const headOf = (p: Pose) => {
  const t = p.pelvis + p.torso;
  return add(add([p.x, p.y], rot(t, [0, -46])), rot(t + p.head, [1.5, -16]));
};

function solveArm(p: Pose, target: number[], bend: number) {
  const S = shoulderOf(p);
  let dx = target[0] - S[0];
  let dy = target[1] - S[1];
  let d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.5;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  const phi = Math.atan2(dy, dx);
  const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const ua = phi + bend * A;
  const E = [S[0] + L1 * Math.cos(ua), S[1] + L1 * Math.sin(ua)];
  const tU = dirAngle(Math.cos(ua), Math.sin(ua));
  const tF = dirAngle(S[0] + dx - E[0], S[1] + dy - E[1]);
  return { ua: norm(tU - (p.pelvis + p.torso)), fa: norm(tF - tU) };
}

function resolve(spec: PoseSpec): Pose {
  const { handN, handF, ...angles } = spec;
  const p: Pose = { ...DEFAULT, ...(angles as Pose) };
  for (const [s, h] of [['N', handN], ['F', handF]] as const) {
    if (!h) continue;
    const r = solveArm(p, h.abs ?? add(headOf(p), h.head ?? [0, 0]), h.bend ?? 1);
    p['ua' + s] = r.ua;
    p['fa' + s] = r.fa;
  }
  return p;
}

function applyPose(parts: Parts, p: Pose) {
  const base = `translate(${p.x} ${p.y}) rotate(${p.pelvis})`;
  const torso = `${base} rotate(${p.torso})`;
  const arm = (s: string, off: number) => {
    const ua = `${torso} translate(${off} -40) rotate(${p['ua' + s]})`;
    return [ua, `${ua} translate(0 ${L1}) rotate(${p['fa' + s]})`];
  };
  const leg = (s: string, off: number) => {
    const th = `${base} translate(${off} 0) rotate(${p['th' + s]})`;
    const sh = `${th} translate(0 30) rotate(${p['sh' + s]})`;
    return [th, sh, `${sh} translate(0 30) rotate(${p['ft' + s] - (p.pelvis + p['th' + s] + p['sh' + s])})`];
  };
  const [uaN, faN] = arm('N', 0);
  const [uaF, faF] = arm('F', -2.5);
  const [thN, shN, ftN] = leg('N', 1);
  const [thF, shF, ftF] = leg('F', -3);
  const t: Record<string, string> = { torso, head: `${torso} translate(0 -46) rotate(${p.head})`, uaN, faN, uaF, faF, thN, shN, ftN, thF, shF, ftF };
  for (const k of ORDER) parts[k].setAttribute('transform', t[k]);
}

// ------------------------------------------------------------------ postures et déroulé
const TABLE_LEG: [number, number] = [326.5, 197];
const POSES: Record<PoseKey, PoseSpec> = {
  stand: { x: 108, y: 158, torso: 2, uaN: 8, faN: -14, uaF: -8, faF: -18, thN: -3, shN: 2, thF: 5, shW: 22, shX: 3 },
  alarm: { x: 108, y: 158, torso: -5, head: -8, uaN: -28, faN: -105, uaF: -14, faF: -118, thN: -9, shN: 4, thF: 9, shF: -2, shW: 24, shX: 3 },
  drop: { x: 166, y: 186, torso: 68, head: -52, thN: -12, shN: 102, ftN: 168, thF: -4, shF: 94, ftF: 172, handN: { abs: [208, 219] }, handF: { abs: [201, 219] }, shW: 34, shX: 8 },
  cover: { x: 240, y: 188, torso: 82, head: -34, thN: -26, shN: 116, ftN: 172, thF: -18, shF: 108, ftF: 176, handN: { head: [3, -12], bend: 1 }, handF: { head: [-3, -13], bend: 1 }, shW: 38, shX: 12 },
  hold: { x: 246, y: 188, torso: 80, head: -30, thN: -26, shN: 116, ftN: 172, thF: -18, shF: 108, ftF: 176, handN: { abs: TABLE_LEG, bend: 1 }, handF: { head: [-2, -13], bend: -1 }, shW: 40, shX: 14 },
  end: { x: 246, y: 188, torso: 74, head: -18, thN: -26, shN: 116, ftN: 172, thF: -18, shF: 108, ftF: 176, handN: { abs: [306, 220] }, handF: { abs: [298, 220] }, shW: 40, shX: 14 },
};
const RESOLVED = Object.fromEntries(Object.entries(POSES).map(([k, v]) => [k, resolve(v)])) as Record<PoseKey, Pose>;
const PHASES: Phase[] = [
  { id: 'calm', dur: 1900, pose: 'stand', expr: 'calm', tw: 600, badge: '…' },
  { id: 'shake', dur: 1900, pose: 'alarm', expr: 'alarm', tw: 320, badge: '!', cls: 'warn' },
  { id: 'drop', dur: 2600, pose: 'drop', expr: 'focus', tw: 750, badge: '1' },
  { id: 'cover', dur: 3000, pose: 'cover', expr: 'focus', tw: 1500, gait: true, badge: '2' },
  { id: 'hold', dur: 3000, pose: 'hold', expr: 'focus', tw: 600, zoom: true, badge: '3' },
  { id: 'wait', dur: 2600, pose: 'hold', expr: 'focus', tw: 300, zoom: true, badge: '3' },
  { id: 'end', dur: 3200, pose: 'end', expr: 'relief', tw: 1000, badge: '✓', cls: 'ok' },
];
const SHAKING = new Set(['shake', 'drop', 'cover', 'hold', 'wait']);
const STEP_OF: Record<string, string> = { drop: 'drop', cover: 'cover', hold: 'hold', wait: 'hold' };
const FULL = [0, 0, 400, 250];
const ZOOM = [176, 112, 208, 130];
const THUMBS: Record<string, [PoseKey, string]> = { drop: ['drop', '120 128 200 100'], cover: ['cover', '186 128 180 90'], hold: ['hold', '196 128 180 90'] };
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function initThreeActions(root: HTMLElement) {
  const q = <T extends Element>(s: string) => root.querySelector(s) as T;
  const strings: Record<string, string> = JSON.parse(root.dataset.i18n ?? '{}');
  const stage = q<SVGSVGElement>('[data-ta="stage"]');
  const hero = q<SVGGElement>('[data-ta="hero"]');
  const heroParts = buildChar(hero);
  const el = (n: string) => q<SVGElement>(`[data-ta="${n}"]`);
  const room = el('room'), lamp = el('lamp'), frame = el('frame'), vase = el('vase'), shards = el('shards'), shadow = el('shadow');
  const dustG = el('dust'), lines = el('lines'), alertI = el('alert'), okI = el('ok'), grip = el('grip');
  const textEl = q<HTMLElement>('[data-ta-text]'), badge = q<HTMLElement>('[data-ta-badge]'), bar = q<HTMLElement>('[data-ta-bar]');
  const playBtn = q<HTMLButtonElement>('[data-ta-play]'), caption = q<HTMLElement>('[data-ta-caption]');
  const steps = [...root.querySelectorAll<HTMLButtonElement>('[data-go]')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dust = Array.from({ length: 12 }, () => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', (0.8 + Math.random() * 1.4).toFixed(1));
    dustG.appendChild(c);
    return { c, x: 150 + Math.random() * 230, y: Math.random() * 200, v: 0.03 + Math.random() * 0.05 };
  });

  let idx = 0, phaseT = 0, clock = 0, amp = 0, vaseT = -1, visible = false, raf = 0;
  let playing = !reduce;
  let vb = [...FULL];
  let from: Pose = { ...RESOLVED.stand };
  let cur: Pose = { ...RESOLVED.stand };

  const setPlayLabel = () => (playBtn.textContent = playing ? strings.pause : strings.play);

  function enter(i: number, instant = false) {
    idx = i;
    phaseT = 0;
    from = { ...cur };
    const ph = PHASES[idx];
    if (ph.id === 'calm') vaseT = -1;
    if (ph.id === 'cover' && vaseT < 0) vaseT = 0;
    if (instant) {
      cur = { ...RESOLVED[ph.pose] };
      from = { ...cur };
      if (['hold', 'wait', 'end'].includes(ph.id)) vaseT = 1e9;
    }
    hero.dataset.expr = ph.expr;
    textEl.textContent = strings[ph.id];
    badge.textContent = ph.badge;
    badge.className = `ta-badge ${ph.cls ?? ''}`;
    for (const s of steps) s.toggleAttribute('aria-current', s.dataset.go === STEP_OF[ph.id]);
  }

  function lerpPose(a: Pose, b: Pose, k: number): Pose {
    const o: Pose = {};
    for (const key in b) {
      const d = /^(ua|fa)/.test(key) ? norm(b[key] - a[key]) : b[key] - a[key];
      o[key] = a[key] + d * k;
    }
    return o;
  }

  function update(dt: number) {
    let P = PHASES[idx];
    if (playing) {
      clock += dt;
      phaseT += dt;
      if (vaseT >= 0) vaseT += dt;
      if (phaseT >= P.dur) {
        enter((idx + 1) % PHASES.length);
        P = PHASES[idx];
      }
    }
    const k = reduce ? 1 : Math.min(1, phaseT / P.tw);
    cur = lerpPose(from, RESOLVED[P.pose], ease(k));
    if (P.gait && k < 1 && !reduce) {
      const g = Math.sin(k * Math.PI * 6) * Math.sin(k * Math.PI);
      cur.uaN += 22 * g;
      cur.uaF -= 22 * g;
      cur.thN += 12 * g;
      cur.thF -= 12 * g;
      cur.y -= 2.5 * Math.abs(g);
      cur.torso += 3 * g;
    }
    if (P.id === 'calm' || P.id === 'end') cur.torso += Math.sin(clock / 600) * 0.8;
    applyPose(heroParts, cur);
    shadow.setAttribute('cx', String(cur.x + cur.shX));
    shadow.setAttribute('rx', String(cur.shW));

    if (playing) amp += ((SHAKING.has(P.id) ? 1 : 0) - amp) * Math.min(1, dt / 220);
    const a = reduce ? 0 : amp;
    room.setAttribute('transform', `translate(${((Math.sin(clock * 0.09) * 2.2 + Math.sin(clock * 0.23) * 1.2) * a).toFixed(2)} ${(Math.sin(clock * 0.17) * 1.2 * a).toFixed(2)})`);
    lamp.setAttribute('transform', `rotate(${(Math.sin(clock * 0.0058) * 10 * a).toFixed(2)} 268 -20)`);
    frame.setAttribute('transform', `rotate(${(Math.sin(clock * 0.0072) * 5 * a).toFixed(2)} 345 64)`);
    lines.setAttribute('opacity', (a * 0.9).toFixed(2));
    alertI.setAttribute('opacity', P.id === 'shake' ? '1' : '0');
    okI.setAttribute('opacity', P.id === 'end' ? String(Math.min(1, phaseT / 400 + (playing ? 0 : 1))) : '0');
    grip.setAttribute('opacity', P.id === 'hold' || P.id === 'wait' ? (0.55 + 0.45 * Math.sin(clock / 160)).toFixed(2) : '0');
    if (vaseT < 0) {
      vase.setAttribute('transform', `rotate(${(Math.sin(clock * 0.03) * 7 * a).toFixed(2)} 152 104)`);
      shards.setAttribute('opacity', '0');
    } else {
      const f = Math.min(1, vaseT / 650);
      vase.setAttribute('transform', `translate(${12 * f} ${117 * f * f}) rotate(${100 * f} 152 104)`);
      shards.setAttribute('opacity', f >= 1 ? '1' : '0');
    }
    for (const d of dust) {
      if (playing && a > 0.05) {
        d.y += d.v * dt * a;
        d.x += Math.sin((clock + d.v * 1e4) / 300) * 0.05 * dt * a;
        if (d.y > 222) {
          d.y = -5;
          d.x = 150 + Math.random() * 230;
        }
      }
      d.c.setAttribute('cx', d.x.toFixed(1));
      d.c.setAttribute('cy', d.y.toFixed(1));
      d.c.setAttribute('opacity', (a * 0.8).toFixed(2));
    }
    const vt = P.zoom && !reduce ? ZOOM : FULL;
    const s = Math.min(1, dt / 380);
    vb = playing && !reduce ? vb.map((v, i) => v + (vt[i] - v) * s) : [...vt];
    stage.setAttribute('viewBox', vb.map((v) => v.toFixed(2)).join(' '));
    const total = PHASES.reduce((x, y) => x + y.dur, 0);
    const done = PHASES.slice(0, idx).reduce((x, y) => x + y.dur, 0) + Math.min(phaseT, P.dur);
    bar.style.width = `${((done / total) * 100).toFixed(2)}%`;
  }

  let last = 0;
  function loop(now: number) {
    update(last ? Math.min(50, now - last) : 0);
    last = now;
    raf = visible && playing ? requestAnimationFrame(loop) : 0;
  }
  function kick() {
    if (!raf && visible && playing) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  // Vignettes des étapes : même personnage, posture figée
  const bg = q<SVGGElement>('[data-ta="thumb-bg"]');
  for (const [key, [pose, box]] of Object.entries(THUMBS)) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', box);
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('ta-mirror');
    const use = bg.cloneNode(true) as SVGGElement;
    use.removeAttribute('data-ta');
    use.removeAttribute('display');
    svg.appendChild(use);
    const g = document.createElementNS(NS, 'g');
    g.classList.add('ta-char');
    g.dataset.expr = 'focus';
    svg.appendChild(g);
    applyPose(buildChar(g), RESOLVED[pose]);
    if (key === 'hold') svg.insertAdjacentHTML('beforeend', `<circle cx="${TABLE_LEG[0]}" cy="${TABLE_LEG[1]}" r="10" fill="none" stroke="var(--ta-accent)" stroke-width="2.5"/>`);
    root.querySelector(`[data-thumb="${key}"]`)?.appendChild(svg);
  }

  playBtn.addEventListener('click', () => {
    playing = !playing;
    setPlayLabel();
    kick();
  });
  q<HTMLButtonElement>('[data-ta-replay]').addEventListener('click', () => {
    playing = true;
    cur = { ...RESOLVED.stand };
    enter(0);
    setPlayLabel();
    kick();
  });
  for (const s of steps) {
    s.addEventListener('click', () => {
      playing = false;
      setPlayLabel();
      amp = 1;
      caption.setAttribute('aria-live', 'polite'); // annonce seulement quand la personne choisit une étape
      enter(PHASES.findIndex((p) => p.id === s.dataset.go), true);
      update(0);
    });
  }

  // Lecture seulement quand l'animation est à l'écran (économie de batterie)
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    kick();
  }, { threshold: 0.25 }).observe(root);

  enter(reduce ? 2 : 0, reduce);
  setPlayLabel();
  update(0);
}

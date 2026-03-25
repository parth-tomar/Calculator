/* ===========================
   GLASS CALCULATOR — script.js
   =========================== */

'use strict';

// ─── AudioContext & Sound Engine ────────────────────────────────────────────

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let ctx = null;

function ensureAudio() {
  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
}

/**
 * Glass resonator — sine + detuned sine layered, long airy tail.
 * Mimics a finger tapping a crystal glass.
 * @param {number} freq  - fundamental frequency Hz
 * @param {number} vol   - peak gain
 * @param {number} tail  - decay length in seconds
 */
function glassRing(freq, vol = 0.13, tail = 0.55) {
  ensureAudio();
  const t = ctx.currentTime;

  // Fundamental
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, t);

  // Slightly detuned overtone — creates shimmer/chorus
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2.756, t); // non-integer partial → glassy inharmonicity

  // Soft sub-harmonic body
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 0.502, t);

  // Highpass to keep it airy, not boomy
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 320;

  // Reverb-like tail via convolution on a short impulse buffer
  const reverbLen = Math.floor(ctx.sampleRate * 0.4);
  const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = reverbBuf.getChannelData(ch);
    for (let i = 0; i < reverbLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, 3.5);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = reverbBuf;

  // Gains
  const g1 = ctx.createGain();
  const g2 = ctx.createGain();
  const g3 = ctx.createGain();
  const masterGain = ctx.createGain();

  g1.gain.setValueAtTime(vol,       t);
  g1.gain.exponentialRampToValueAtTime(0.0001, t + tail);

  g2.gain.setValueAtTime(vol * 0.35, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + tail * 0.7);

  g3.gain.setValueAtTime(vol * 0.18, t);
  g3.gain.exponentialRampToValueAtTime(0.0001, t + tail * 0.5);

  masterGain.gain.setValueAtTime(0,    t);
  masterGain.gain.linearRampToValueAtTime(1, t + 0.004); // instant attack

  // Wet reverb mix
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.18;

  osc1.connect(g1); g1.connect(hp);
  osc2.connect(g2); g2.connect(hp);
  osc3.connect(g3); g3.connect(hp);

  hp.connect(masterGain);
  masterGain.connect(ctx.destination);

  // Light reverb send
  hp.connect(conv);
  conv.connect(wetGain);
  wetGain.connect(ctx.destination);

  const stop = t + tail + 0.05;
  osc1.start(t); osc1.stop(stop);
  osc2.start(t); osc2.stop(stop);
  osc3.start(t); osc3.stop(stop);
}

/**
 * Frosted-glass tap — pink noise burst through a narrow bandpass,
 * simulating a muted finger tap on frosted glass.
 */
function glassTap(centerFreq = 2200, vol = 0.15, dur = 0.06) {
  ensureAudio();
  const t = ctx.currentTime;
  const bufLen = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);

  // Pink-ish noise (weighted random walk)
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufLen; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    data[i] = (b0 + b1 + b2 + w * 0.5362) / 3.5;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Tight bandpass — glass resonance peak
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = centerFreq;
  bp.Q.value = 4.5;

  // Second resonance peak (body)
  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.frequency.value = centerFreq * 0.48;
  bp2.Q.value = 3.0;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(bp);  bp.connect(gain);
  src.connect(bp2); bp2.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
}

// ── Public sound functions ───────────────────────────────────────────────────

/** Number tap — light crystal ping with slight pitch variation */
function soundNum() {
  const notes = [1047, 1175, 1319, 1109, 988]; // C6 D6 E6 D6 B5
  const freq = notes[Math.floor(Math.random() * notes.length)];
  glassRing(freq, 0.11, 0.42);
  glassTap(freq * 2.1, 0.08, 0.04);
}

/** Operator — lower, rounder glass resonance */
function soundOp() {
  glassRing(784, 0.13, 0.52);   // G5
  glassTap(1600, 0.10, 0.05);
}

/** Equals — ascending crystal chord: G5 → B5 → D6 */
function soundEquals() {
  glassRing(784,  0.14, 0.70);
  setTimeout(() => glassRing(988,  0.12, 0.65), 90);
  setTimeout(() => glassRing(1175, 0.10, 0.80), 185);
  glassTap(2400, 0.09, 0.06);
}

/** Clear — descending glass sweep + airy noise fade */
function soundClear() {
  ensureAudio();
  const t = ctx.currentTime;

  // Falling pitch sweep
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(320, t + 0.28);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.14, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);

  // Airy noise layer
  const nLen = Math.floor(ctx.sampleRate * 0.22);
  const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
  const nd   = nBuf.getChannelData(0);
  for (let i = 0; i < nLen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nLen);

  const nSrc = ctx.createBufferSource();
  nSrc.buffer = nBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.06, t);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

  osc.connect(gain);   gain.connect(ctx.destination);
  nSrc.connect(hp);    hp.connect(nGain);   nGain.connect(ctx.destination);

  osc.start(t); osc.stop(t + 0.32);
  nSrc.start(t);
}

/** Function key (%, +/−, decimal) — delicate high tap */
function soundClick() {
  glassRing(1568, 0.09, 0.32); // G6 — bright but subtle
  glassTap(3000, 0.06, 0.03);
}

/** Error — dissonant glass cluster */
function soundError() {
  ensureAudio();
  glassRing(523,  0.12, 0.35); // C5
  glassRing(554,  0.10, 0.30); // C#5 — minor 2nd dissonance
  setTimeout(() => glassRing(440, 0.08, 0.40), 120); // A4 — unsettled landing
}

const SOUNDS = {
  num:    soundNum,
  op:     soundOp,
  equals: soundEquals,
  clear:  soundClear,
  click:  soundClick,
  error:  soundError,
};


// ─── DOM References ──────────────────────────────────────────────────────────

const $result     = document.getElementById('result');
const $expression = document.getElementById('expression');
const $buttons    = document.querySelectorAll('.btn');
const $rippleCont = document.getElementById('ripple-container');


// ─── Calculator State ────────────────────────────────────────────────────────

const state = {
  current:    '0',      // number currently being built
  previous:   '',       // previous operand
  operator:   null,     // pending operator symbol
  justEvaled: false,    // true right after pressing =
  hasDecimal: false,
};

function resetState() {
  state.current    = '0';
  state.previous   = '';
  state.operator   = null;
  state.justEvaled = false;
  state.hasDecimal = false;
}


// ─── Display Helpers ─────────────────────────────────────────────────────────

/** Format a number string for display — add commas, respect decimals. */
function formatDisplay(numStr) {
  if (numStr === 'Error') return 'Error';

  const parts = numStr.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? intPart + '.' + parts[1] : intPart;
}

/** Shrink font if number is long. */
function fitResult(text) {
  const len = text.replace(/[,.-]/g, '').length;
  if      (len > 12) $result.style.fontSize = '26px';
  else if (len > 9)  $result.style.fontSize = '36px';
  else if (len > 6)  $result.style.fontSize = '44px';
  else               $result.style.fontSize = '52px';
}

function updateDisplay() {
  const txt = formatDisplay(state.current);
  $result.textContent = txt;
  fitResult(txt);

  if (state.operator && state.previous) {
    $expression.textContent = `${formatDisplay(state.previous)} ${state.operator}`;
  } else {
    $expression.textContent = '';
  }
}

function popResult() {
  $result.classList.remove('pop', 'error');
  void $result.offsetWidth; // reflow
  $result.classList.add('pop');
}

function errorResult() {
  $result.classList.remove('pop', 'error');
  void $result.offsetWidth;
  $result.classList.add('error');
}


// ─── Core Calculation ─────────────────────────────────────────────────────────

function evaluate(a, op, b) {
  const x = parseFloat(a), y = parseFloat(b);
  if (isNaN(x) || isNaN(y)) return NaN;
  switch (op) {
    case '+': return x + y;
    case '−': return x - y;
    case '×': return x * y;
    case '÷': return y === 0 ? null : x / y; // null → division by zero
    default:  return NaN;
  }
}

/** Round floating-point noise (e.g. 0.1+0.2). */
function clean(n) {
  return parseFloat(n.toPrecision(12));
}


// ─── Actions ─────────────────────────────────────────────────────────────────

function doNumber(v) {
  if (state.justEvaled) {
    state.current    = v;
    state.previous   = '';
    state.operator   = null;
    state.justEvaled = false;
    state.hasDecimal = false;
  } else if (state.current === '0' && v !== '.') {
    state.current = v;
  } else {
    if (state.current.length >= 12) return; // cap input length
    state.current += v;
  }
}

function doDecimal() {
  if (state.hasDecimal) return;
  state.hasDecimal = true;
  if (state.justEvaled) {
    state.current    = '0.';
    state.justEvaled = false;
    state.operator   = null;
    state.previous   = '';
  } else {
    state.current += '.';
  }
}

function doOperator(op) {
  // Chain operations: if operator pending and user typed new number, evaluate first
  if (state.operator && !state.justEvaled && state.previous) {
    const res = evaluate(state.previous, state.operator, state.current);
    if (res === null) { doError(); return; }
    const cleaned = String(clean(res));
    state.previous = cleaned;
    state.current  = cleaned;
  } else {
    state.previous = state.current;
  }

  state.operator   = op;
  state.justEvaled = false;
  state.hasDecimal = false;
  // Next digit input will replace current
  state.justEvaled = true;  // trick: next number press starts fresh
  state.justEvaled = false;
  // Actually let's set a flag so next doNumber replaces current
  state._pendingOp = true;
}

// Override doNumber to handle pending operator
const _origDoNumber = doNumber;
function doNumberSafe(v) {
  if (state._pendingOp) {
    state.current    = v;
    state.hasDecimal = false;
    state._pendingOp = false;
  } else {
    _origDoNumber(v);
  }
}

function doEquals() {
  if (!state.operator || !state.previous) return;

  const a   = state.previous;
  const op  = state.operator;
  const b   = state._pendingOp ? state.previous : state.current;
  const res = evaluate(a, op, b);

  if (res === null) { doError(); return; }
  if (isNaN(res))   { doError(); return; }

  const cleaned = String(clean(res));
  $expression.textContent = `${formatDisplay(a)} ${op} ${formatDisplay(state._pendingOp ? a : state.current)} =`;

  state.current    = cleaned;
  state.previous   = '';
  state.operator   = null;
  state.justEvaled = true;
  state._pendingOp = false;
  state.hasDecimal = cleaned.includes('.');
}

function doClear() {
  resetState();
  state._pendingOp = false;
}

function doSign() {
  if (state.current === '0') return;
  if (state.current.startsWith('-')) {
    state.current = state.current.slice(1);
  } else {
    state.current = '-' + state.current;
  }
}

function doPercent() {
  const n = parseFloat(state.current);
  if (isNaN(n)) return;
  const res = clean(n / 100);
  state.current    = String(res);
  state.hasDecimal = state.current.includes('.');
  state.justEvaled = false;
}

function doError() {
  soundError();
  errorResult();
  state.current = 'Error';
  state.previous   = '';
  state.operator   = null;
  state._pendingOp = false;
  $result.textContent = 'Error';
  $expression.textContent = '';
  setTimeout(() => {
    resetState();
    state._pendingOp = false;
    $result.textContent = '0';
    $result.classList.remove('error');
  }, 1400);
}


// ─── Button Highlight (operator selected state) ──────────────────────────────

function highlightOp(op) {
  document.querySelectorAll('.btn-op').forEach(b => {
    b.classList.toggle('selected', b.dataset.value === op);
  });
}

function clearOpHighlight() {
  document.querySelectorAll('.btn-op').forEach(b => b.classList.remove('selected'));
}


// ─── Ripple on click ─────────────────────────────────────────────────────────

function spawnRipple(e, el) {
  const rect   = el.getBoundingClientRect();
  const size   = Math.max(rect.width, rect.height);
  const x      = (e.clientX ?? rect.left + rect.width  / 2) - rect.left - size / 2;
  const y      = (e.clientY ?? rect.top  + rect.height / 2) - rect.top  - size / 2;

  const ripple = document.createElement('div');
  ripple.className = 'ripple';
  ripple.style.cssText = `
    left: ${rect.left + x + size / 2}px;
    top:  ${rect.top  + y + size / 2}px;
    width:  ${size}px;
    height: ${size}px;
    margin-left: -${size / 2}px;
    margin-top:  -${size / 2}px;
  `;
  $rippleCont.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}


// ─── Button Flash ─────────────────────────────────────────────────────────────

function flashBtn(el) {
  el.classList.remove('btn-flash');
  void el.offsetWidth;
  el.classList.add('btn-flash');
  el.addEventListener('animationend', () => el.classList.remove('btn-flash'), { once: true });
}


// ─── Main Event Handler ───────────────────────────────────────────────────────

function handleButton(el, event) {
  const action = el.dataset.action;
  const value  = el.dataset.value;
  const sound  = el.dataset.sound;

  // Visual feedback
  spawnRipple(event, el);
  flashBtn(el);

  // Sound
  if (SOUNDS[sound]) SOUNDS[sound]();

  // Logic
  switch (action) {
    case 'number':
      if (state.current === 'Error') return;
      doNumberSafe(value);
      clearOpHighlight();
      updateDisplay();
      popResult();
      break;

    case 'decimal':
      if (state.current === 'Error') return;
      doDecimal();
      updateDisplay();
      break;

    case 'operator':
      if (state.current === 'Error') return;
      doOperator(value);
      highlightOp(value);
      updateDisplay();
      break;

    case 'equals':
      if (state.current === 'Error') return;
      doEquals();
      clearOpHighlight();
      updateDisplay();
      popResult();
      break;

    case 'clear':
      doClear();
      clearOpHighlight();
      updateDisplay();
      popResult();
      break;

    case 'sign':
      if (state.current === 'Error') return;
      doSign();
      updateDisplay();
      break;

    case 'percent':
      if (state.current === 'Error') return;
      doPercent();
      updateDisplay();
      popResult();
      break;
  }
}

// Attach click listeners
$buttons.forEach(btn => {
  btn.addEventListener('click', (e) => handleButton(btn, e));
  // Pointer events for touch
  btn.addEventListener('pointerdown', () => {
    btn.style.transition = 'transform 60ms ease, background 60ms ease, box-shadow 60ms ease';
  });
  btn.addEventListener('pointerup', () => {
    btn.style.transition = '';
  });
});


// ─── Keyboard Support ─────────────────────────────────────────────────────────

const KEY_MAP = {
  '0': { action: 'number', value: '0', sound: 'num' },
  '1': { action: 'number', value: '1', sound: 'num' },
  '2': { action: 'number', value: '2', sound: 'num' },
  '3': { action: 'number', value: '3', sound: 'num' },
  '4': { action: 'number', value: '4', sound: 'num' },
  '5': { action: 'number', value: '5', sound: 'num' },
  '6': { action: 'number', value: '6', sound: 'num' },
  '7': { action: 'number', value: '7', sound: 'num' },
  '8': { action: 'number', value: '8', sound: 'num' },
  '9': { action: 'number', value: '9', sound: 'num' },
  '.': { action: 'decimal', sound: 'click' },
  ',': { action: 'decimal', sound: 'click' },
  '+': { action: 'operator', value: '+', sound: 'op' },
  '-': { action: 'operator', value: '−', sound: 'op' },
  '*': { action: 'operator', value: '×', sound: 'op' },
  '/': { action: 'operator', value: '÷', sound: 'op' },
  'Enter':     { action: 'equals', sound: 'equals' },
  '=':         { action: 'equals', sound: 'equals' },
  'Backspace': { action: 'clear',   sound: 'clear' },
  'Escape':    { action: 'clear',   sound: 'clear' },
  '%':         { action: 'percent', sound: 'click' },
};

document.addEventListener('keydown', (e) => {
  const map = KEY_MAP[e.key];
  if (!map) return;
  e.preventDefault();

  // Find matching DOM button and flash it
  let matchBtn = null;
  $buttons.forEach(btn => {
    if (btn.dataset.action === map.action) {
      if (map.value && btn.dataset.value !== map.value) return;
      matchBtn = btn;
    }
  });

  if (matchBtn) spawnRipple({ clientX: null, clientY: null }, matchBtn);
  if (matchBtn) flashBtn(matchBtn);

  // Sound
  if (SOUNDS[map.sound]) SOUNDS[map.sound]();

  // Logic (re-use same switch)
  const el = { dataset: { action: map.action, value: map.value, sound: map.sound } };
  handleButton(el, {});
});


// ─── Init ────────────────────────────────────────────────────────────────────

updateDisplay();

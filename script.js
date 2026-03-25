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
 * Synthesise a short pitched click / tone.
 * @param {number} freq   - base frequency in Hz
 * @param {string} type   - oscillator type
 * @param {number} dur    - duration in seconds
 * @param {number} vol    - peak gain (0-1)
 * @param {number} detune - pitch detune in cents
 */
function playTone(freq, type = 'sine', dur = 0.08, vol = 0.18, detune = 0) {
  ensureAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + dur + 0.01);
}

/** Soft number key tap */
function soundNum() {
  playTone(600 + Math.random() * 80, 'triangle', 0.07, 0.14);
}

/** Warm operator click */
function soundOp() {
  playTone(480, 'sine', 0.12, 0.18, -20);
  setTimeout(() => playTone(720, 'sine', 0.06, 0.08, 10), 30);
}

/** Satisfying equals chime — two-tone */
function soundEquals() {
  playTone(660, 'sine', 0.22, 0.22);
  setTimeout(() => playTone(990, 'sine', 0.16, 0.14), 80);
  setTimeout(() => playTone(1320, 'sine', 0.10, 0.09), 160);
}

/** Whoosh-style clear */
function soundClear() {
  ensureAudio();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1800, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.14);
  filter.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

/** Soft decimal/function click */
function soundClick() {
  playTone(520, 'triangle', 0.06, 0.12);
}

/** Error buzz */
function soundError() {
  playTone(180, 'sawtooth', 0.18, 0.15);
  setTimeout(() => playTone(150, 'sawtooth', 0.12, 0.10), 100);
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

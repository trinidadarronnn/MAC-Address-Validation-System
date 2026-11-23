/* =====================================================================
   MAC Address Validator - DFA-based lexical analyzer
   ---------------------------------------------------------------------
   The DFA has 19 states:
     q0          start state
     q1 .. q16   intermediate states (one per character read so far)
     q17         accepting state (all 17 characters were valid)
     qd          trap (dead) state - once entered, it can never be left

   State number = how many valid characters have been read so far.
   The next character is expected to be:
     - a colon ':'      when the state is 2, 5, 8, 11 or 14  (state % 3 === 2)
     - a hex character  for every other state below 17
   Any other character moves the DFA to qd.
   Reading anything after q17 also moves it to qd (the address is too long).
   ===================================================================== */

const ACCEPT_STATE = 17;       // q17
const TRAP = 'qd';             // trap state
const HEX_CHARS = '0123456789ABCDEFabcdef';

// ===== PART 1: DFA logic (no HTML involved) =====

// Is this single character a hexadecimal digit (0-9, A-F, a-f)?
function isHex(ch) {
  return ch.length === 1 && HEX_CHARS.includes(ch);
}

// What does the DFA expect when it is in this state? ('hex', ':' or 'none')
function expectedAt(state) {
  if (state === TRAP || state >= ACCEPT_STATE) return 'none';
  return state % 3 === 2 ? ':' : 'hex';
}

// The transition function: delta(state, character) -> next state
function nextState(state, ch) {
  if (state === TRAP || state === ACCEPT_STATE) return TRAP;   // trap stays trapped; q17 + more input = too long
  if (expectedAt(state) === ':') return ch === ':' ? state + 1 : TRAP;
  return isHex(ch) ? state + 1 : TRAP;
}

// Explain WHY a character was rejected (which formatting rule was violated)
function explainFailure(state, ch, index) {
  const pos = index + 1;
  const pair = Math.floor(index / 3) + 1;
  if (state === ACCEPT_STATE) {
    return `Extra character "${ch}" at position ${pos}. A MAC address must have exactly 17 characters (too long).`;
  }
  if (expectedAt(state) === ':') {
    if (isHex(ch)) {
      return `Position ${pos}: expected a colon ":" after pair ${pair}, but found "${ch}". Each pair must contain exactly 2 characters (pair too long or colon missing).`;
    }
    return `Position ${pos}: expected a colon ":" separator but found "${ch}". Incorrect separator.`;
  }
  if (ch === ':') {
    return `Position ${pos}: expected a hexadecimal character in pair ${pair} but found ":". Each pair must contain exactly 2 characters (missing character).`;
  }
  return `Position ${pos}: "${ch}" is not a valid hexadecimal character. Only 0-9, A-F and a-f are allowed.`;
}

// Run the DFA on the whole input. Returns the trace plus the final verdict.
function runDFA(input) {
  let state = 0;               // start in q0
  const trace = [];            // one entry per character read
  let reason = '';

  for (let i = 0; i < input.length; i++) {      // read left to right
    const ch = input[i];
    const from = state;
    const to = nextState(from, ch);
    trace.push({ index: i, ch, expected: expectedAt(from), from, to });
    state = to;
    if (state === TRAP) {                       // rejected: stop reading
      reason = explainFailure(from, ch, i);
      break;
    }
  }

  const accepted = state === ACCEPT_STATE;      // accepted only if we end in q17
  if (accepted) {
    reason = 'All 17 characters were valid: 6 hexadecimal pairs separated by 5 colons. The DFA ended in q17.';
  } else if (state !== TRAP) {                  // input ended before q17
    reason = input.length === 0
      ? 'The input is empty. The DFA stayed in q0 and a MAC address needs 17 characters.'
      : `The input ended after ${input.length} character(s), in q${state}. A MAC address must have exactly 17 characters (too short).`;
  }
  return { accepted, finalState: state, trace, reason };
}

// ===== PART 2: Page (user interface) code =====

const $ = (id) => document.getElementById(id);
const input = $('macInput');
let timers = [];               // animation timers (so Clear can cancel them)

// ----- Positions of states in the diagram: 3 rows of 6, snaking left-right-left -----
function statePos(i) {
  const row = Math.floor(i / 6);
  let col = i % 6;
  if (row % 2 === 1) col = 5 - col;            // odd rows run right to left
  return { x: 60 + col * 120, y: 50 + row * 100 };
}
const TRAP_POS = { x: 360, y: 350 };
const R = 24;                                   // circle radius
const NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs, parent) {
  const el = document.createElementNS(NS, name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

// Draw an arrow from point a to point b (shortened so it touches the circle edges)
function drawEdge(svg, a, b, label, cls) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const x1 = a.x + ux * R, y1 = a.y + uy * R, x2 = b.x - ux * (R + 2), y2 = b.y - uy * (R + 2);
  svgEl('line', { x1, y1, x2, y2, class: cls || 'edge', 'marker-end': 'url(#arrow)' }, svg);
  if (label) {
    const horizontal = dy === 0;
    const t = svgEl('text', {
      x: (x1 + x2) / 2 + (horizontal ? 0 : 16),
      y: (y1 + y2) / 2 + (horizontal ? -8 : 4),
      class: 'edge-label'
    }, svg);
    t.textContent = label;
  }
}

// Build the whole DFA picture once, when the page loads
function buildDiagram() {
  const svg = $('dfaSvg');
  const defs = svgEl('defs', {}, svg);
  const marker = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
                                   markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
  svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#7f8c8d' }, marker);

  // Transitions q0 -> q1 -> ... -> q17 (label ":" or "hex")
  for (let i = 0; i < ACCEPT_STATE; i++) {
    drawEdge(svg, statePos(i), statePos(i + 1), expectedAt(i) === ':' ? ':' : 'hex');
  }

  // Start arrow into q0
  const p0 = statePos(0);
  svgEl('line', { x1: 8, y1: p0.y, x2: p0.x - R - 2, y2: p0.y, class: 'edge', 'marker-end': 'url(#arrow)' }, svg);
  const st = svgEl('text', { x: 20, y: p0.y - 8, class: 'edge-label' }, svg);
  st.textContent = 'start';

  // States q0..q17
  for (let i = 0; i <= ACCEPT_STATE; i++) {
    const p = statePos(i);
    const g = svgEl('g', { id: 'state-' + i, class: 'node' }, svg);
    svgEl('circle', { cx: p.x, cy: p.y, r: R }, g);
    if (i === ACCEPT_STATE) svgEl('circle', { cx: p.x, cy: p.y, r: R - 5 }, g);   // double circle = accepting
    const t = svgEl('text', { x: p.x, y: p.y }, g);
    t.textContent = 'q' + i;
  }

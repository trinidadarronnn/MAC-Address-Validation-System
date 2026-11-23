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

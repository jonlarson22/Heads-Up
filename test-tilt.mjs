// Tilt-engine unit tests. Extracts the REAL section 9 from app.js and drives
// handleMotion() with simulated devicemotion events.
// Run: node test-tilt.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const start = src.indexOf('// 9. TILT CONTROLS ENGINE');
const end = src.indexOf('// 10. EVENT LISTENERS');
if (start === -1 || end === -1 || end < start) {
  console.error('FAIL: could not locate tilt engine section markers');
  process.exit(1);
}
const tiltSrc = src.slice(start, end);

// ---- Harness: stub the module-scope names the engine touches ----
let correct = 0, skip = 0;
let isGameActive = false;
let motionHandler = null;
let nowMs = 0;
const windowStub = {
  addEventListener: (type, fn) => { if (type === 'devicemotion') motionHandler = fn; },
};
const performanceStub = { now: () => nowMs };
// DeviceMotionEvent undefined => permission branch skipped, listener attached directly
const factory = new Function(
  'window', 'performance', 'DeviceMotionEvent',
  `let isGameActive = false;
   let correctCount = 0, skipCount = 0;
   function handleCorrectAction() { correctCount++; }
   function handleSkipAction() { skipCount++; }
   ${tiltSrc}
   return {
     attachMotionListener,
     handleMotion,
     setActive: (v) => { isGameActive = v; },
     getCounts: () => ({ correct: correctCount, skip: skipCount }),
     resetCounts: () => { correctCount = 0; skipCount = 0; },
     resetEngine: () => { baselineGx = null; baselineGz = null; tiltArmed = true; lastTiltAt = 0; },
   };`
);
const T = factory(windowStub, performanceStub, undefined);
T.attachMotionListener();
if (typeof motionHandler !== 'function') {
  console.error('FAIL: devicemotion listener was not attached');
  process.exit(1);
}

// ---- Helpers ----
const G = 9.81;
function emit(gx, gy, gz, dtMs = 16) {
  nowMs += dtMs;
  motionHandler({ accelerationIncludingGravity: { x: gx, y: gy, z: gz } });
}
function settle(gx, gz, n = 400) { for (let i = 0; i < n; i++) emit(gx, 0, gz); }
// linear ramp of gz from a to b
function nod(gx, a, b, n = 30) {
  for (let i = 1; i <= n; i++) emit(gx, 0, a + ((b - a) * i) / n);
}
let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`ok   - ${name}`);
  else { console.error(`FAIL - ${name} ${extra}`); failures++; }
}
function freshRound() {
  T.resetCounts();
  T.resetEngine();
  T.setActive(true);
  nowMs = 100000; // far past debounce window
}

// ---- Scenario 1: facing east (gx<0). Nod down (gz -> +) = correct ----
freshRound();
settle(-G, 0);                       // phone vertical on forehead
nod(-G, 0, 0.7 * G);                 // nod down
settle(-G * 0.7, 0.7 * G, 10);       // hold (frozen baseline: no double fire)
{
  const c = T.getCounts();
  check('nod-down fires exactly one correct', c.correct === 1 && c.skip === 0, JSON.stringify(c));
}
settle(-G, 0, 200);                  // return to neutral -> re-arm, no false fire
{
  const c = T.getCounts();
  check('return to neutral fires nothing', c.correct === 1 && c.skip === 0, JSON.stringify(c));
}
nod(-G, 0, -0.7 * G);                // nod up
settle(-G * 0.7, -0.7 * G, 10);
{
  const c = T.getCounts();
  check('nod-up fires exactly one skip', c.correct === 1 && c.skip === 1, JSON.stringify(c));
}

// ---- Scenario 2: facing west (gx>0). Signs flip, down still = correct ----
freshRound();
settle(G, 0);
nod(G, 0, -0.7 * G);                 // nod down when facing west => gz negative
settle(G * 0.7, -0.7 * G, 10);
{
  const c = T.getCounts();
  check('facing-west nod-down = correct', c.correct === 1 && c.skip === 0, JSON.stringify(c));
}
settle(G, 0, 200);
nod(G, 0, 0.7 * G);                  // nod up => gz positive
settle(G * 0.7, 0.7 * G, 10);
{
  const c = T.getCounts();
  check('facing-west nod-up = skip', c.correct === 1 && c.skip === 1, JSON.stringify(c));
}

// ---- Scenario 3: phone flat on table -> no triggers (vertical gate) ----
freshRound();
settle(0.3, -G, 400);                // lying flat, screen up
nod(0.3, -G, -G + 0.6 * G, 30);      // wiggle
{
  const c = T.getCounts();
  check('flat phone never triggers', c.correct === 0 && c.skip === 0, JSON.stringify(c));
}

// ---- Scenario 4: lean-back grip (top tilted 20deg toward player) ----
freshRound();
const lean = 20 * Math.PI / 180;
settle(-G * Math.cos(lean), -G * Math.sin(lean), 400); // baseline adapts to lean
nod(-G * Math.cos(lean), -G * Math.sin(lean), -G * Math.sin(lean) + 0.7 * G, 30);
{
  const c = T.getCounts();
  check('lean-back grip: nod-down still correct', c.correct === 1 && c.skip === 0, JSON.stringify(c));
}

// ---- Scenario 5: inactive game -> no triggers ----
freshRound();
T.setActive(false);
settle(-G, 0, 100);
nod(-G, 0, 0.8 * G, 30);
{
  const c = T.getCounts();
  check('inactive game ignores motion', c.correct === 0 && c.skip === 0, JSON.stringify(c));
}

// ---- Scenario 6: shallow nod below threshold -> nothing ----
freshRound();
T.setActive(true);
settle(-G, 0, 300);
nod(-G, 0, 0.3 * G, 20);             // only ~17deg, under 0.45 trigger
settle(-G, 0, 100);
{
  const c = T.getCounts();
  check('shallow nod does not trigger', c.correct === 0 && c.skip === 0, JSON.stringify(c));
}

console.log(failures === 0 ? '\nALL TILT TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

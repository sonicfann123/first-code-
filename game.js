// Genesis-style rhythm prototype with pixel sprites for Sonic, Tails, Knuckles, and an Eggman background finale.
// Focus: 320x240 pixel canvas, limited palette, sprite-draw routines to mimic Genesis-era visuals.
// Updated: replaced sonicSprite with a hand-crafted pixel map derived from the provided image and mapped to the existing palette.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// Pixel scale for sprites (drawn at 1x canvas pixels then scaled by CSS)
const PIX = 2; // visual upscale in CSS; canonical pixels in sprite maps are 1 canvas px

// Genesis-inspired palette (limited set)
const palette = {
  bg: '#07101a',
  panel: '#06212b',
  note: '#ffd400',
  noteHit: '#00ff88',
  miss: '#ff3d3d',
  text: '#cfe7ff',
  sonicBlue: '#0060bb',
  sonicTrim: '#ffd400',
  tailsOrange: '#ffb14d',
  flesh: '#ffe2b0',
  shoeRed: '#d32f2f',
  knucklesRed: '#b21f2b',
  eggmanPurple: '#6b1d6a',
  floor: '#2b5134'
};

// UI elements
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const bpmSlider = document.getElementById('bpm');
const difficultySel = document.getElementById('difficulty');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const healthEl = document.getElementById('health');

let audioCtx = null;
let running = false;
let lastTime = 0;
let gameTime = 0; // seconds since song start
let score = 0, combo = 0, health = 100;

// Beat/tempo
let bpm = Number(bpmSlider.value);
bpmSlider.addEventListener('input', ()=> bpm = Number(bpmSlider.value));

// Difficulty modifies travel time and hit window
function difficultySettings(level){
  if(level === 'easy') return {travel:2.4, hitWindow:0.26};
  if(level === 'hard') return {travel:1.0, hitWindow:0.12};
  return {travel:1.8, hitWindow:0.18}; // normal
}
difficultySel.addEventListener('change', ()=> Object.assign(settings, difficultySettings(difficultySel.value)));
let settings = difficultySettings(difficultySel.value);

// Note lanes
const lanes = ['left','down','up','right'];
const laneX = {
  left: W*0.20,
  down: W*0.40,
  up: W*0.60,
  right: W*0.80
};
const laneYTarget = H*0.75;

// Notes pool
let notes = [];
const patternBeats = [0,1,2,3, 4,4.5,5,5.5, 6,7,8,9, 10,10.5,11,11.5, 12,13,14,15];
function laneForBeat(b){ const i = Math.floor((b*7)%lanes.length); return lanes[i]; }
function generateNotes(loopStartBeat=0, loops=2){ notes = []; for(let loop=0; loop<loops; loop++){ const offset = loopStartBeat + loop*16; patternBeats.forEach(b=>{ const beat = offset + b; const time = beat * (60/bpm); notes.push({spawnTime: time - settings.travel, beatTime: time, lane: laneForBeat(b), hit:false, judged:false}); }); } }

// Input
const inputState = {left:false,up:false,down:false,right:false};
window.addEventListener('keydown', e=>{ if(!running) return; const map = {'ArrowLeft':'left','ArrowUp':'up','ArrowDown':'down','ArrowRight':'right'}; if(map[e.key]){ handleHit(map[e.key]); inputState[map[e.key]] = true; e.preventDefault(); } });
window.addEventListener('keyup', e=>{ const map = {'ArrowLeft':'left','ArrowUp':'up','ArrowDown':'down','ArrowRight':'right'}; if(map[e.key]){ inputState[map[e.key]] = false; } });

// Rating FX pool
let ratingFX = [];
function spawnRatingFX(text, x, y, color){ ratingFX.push({text, x, y, t:0, color}); }

function handleHit(lane){
  const now = gameTime;
  // find closest unjudged note in that lane
  let best = null, bestDT = Infinity;
  for(const n of notes){
    if(n.lane !== lane || n.judged) continue;
    const dt = Math.abs(n.beatTime - now);
    if(dt < bestDT){ bestDT = dt; best = n; }
  }

  // rating windows (relative to configured hitWindow)
  const okW = settings.hitWindow; // base
  const sickW = Math.min(0.06, okW * 0.33); // cap sick at ~60ms for fairness
  const goodW = Math.min(0.12, okW * 0.66);
  const badW = okW * 1.5; // allow "bad" hits a bit after the normal window

  if(best && bestDT <= badW){
    // Acceptable hit (including BAD)
    best.judged = true;
    best.hit = true;

    let rating = 'OK';
    if(bestDT <= sickW) rating = 'SICK';
    else if(bestDT <= goodW) rating = 'GOOD';
    else if(bestDT <= okW) rating = 'OK';
    else rating = 'BAD';

    // scoring and health effects by rating
    switch(rating){
      case 'SICK':
        score += 400;
        combo += 1;
        health = Math.min(100, health + 4);
        spawnRatingFX('SICK', laneX[lane], laneYTarget - 36, '#6ef0a6');
        playChipNote(0.01);
        break;
      case 'GOOD':
        score += 260;
        combo += 1;
        health = Math.min(100, health + 2);
        spawnRatingFX('GOOD', laneX[lane], laneYTarget - 36, '#68d6ff');
        playChipNote(0.04);
        break;
      case 'OK':
        score += 150;
        combo += 1;
        health = Math.min(100, health + 1);
        spawnRatingFX('OK', laneX[lane], laneYTarget - 36, '#ffd400');
        playChipNote(0.08);
        break;
      case 'BAD':
        score += 40;
        combo = 0; // breaks combo
        health -= 3;
        spawnRatingFX('BAD', laneX[lane], laneYTarget - 36, '#ff9a3c');
        playMissBeep();
        break;
    }

    spawnHitFX(best);
    updateHUD();
  } else {
    // Miss (no note in window)
    combo = 0;
    health -= 7;
    spawnMissFX(lane);
    spawnRatingFX('OOF!', laneX[lane], laneYTarget - 36, '#ff5a5a');
    playMissBeep();
    updateHUD();
  }
}

let hitFX = [];
let missFX = [];
function spawnHitFX(n){ hitFX.push({x:laneX[n.lane], y:laneYTarget, t:0}); }
function spawnMissFX(lane){ missFX.push({x:laneX[lane], y:laneYTarget+8, t:0}); }

// Actors
const sonic = { x: W*0.78, y: H*0.34, anim:0, animDir:1, tauntTimer:0 };
const tails = { x: W*0.92, y: H*0.40, anim:0, animDir:1, active:false, entranceTimer:0 };
const knuckles = { x: W*0.66, y: H*0.36, anim:0, animDir:1, active:false, entranceTimer:0 };
const eggman = { x: W*0.9, y: H*0.12, active:false };
let finale = { active:false, startTime:0, endTime:0 };

// Sprites as pixel maps (small grids). Use characters for palette keys.
// Hand-pixelated Sonic sprite derived from the provided image (20x16)
const sonicSprite = [
  "....................",
  ".....bbbbbbbbbb.....",
  "....bbbbbbbbbbb.....",
  "...bbbbffbbbbb......",
  "..bbbbfffffbbbbb....",
  ".bbbbfffrffffbbbf....",
  ".bbbfrrfffrrffbbf....",
  ".bbbfrrffffrrffbf....",
  ".bbbfrrrrrfffrrbf....",
  "..bbfrrrfffrrrbb....",
  "...bbrrrrrbbbbb.....",
  "....bbrr..bbbbb.....",
  ".....bb...bbbb......",
  ".....ss...sss.......",
  ".....ss.....ss......",
  "...................."
];
// Palette mapping for sprite: b=blue, f=flesh (face/chest), r=tan/face, s=shoe, .=transparent
const sonicPaletteMap = { 'b': palette.sonicBlue, 'f': palette.flesh, 'r': palette.flesh, 's': palette.shoeRed, '.': null };

// Tails: 12x12 sprite
const tailsSprite = [
  "....ooo.....",
  "...ooooo....",
  "..oooffoo....",
  ".ooffffffo....",
  ".ooffffffo....",
  ".oooffffoo....",
  "..oooffoo.....",
  "...oo.oo......",
  "....oo........",
  "...sss........",
  "..ssooss......",
  ".............."
];
const tailsPaletteMap = { 'o': palette.tailsOrange, 'f': palette.flesh, 's': palette.shoeRed, '.': null };

// Knuckles: simple 12x12 sprite
const knucklesSprite = [
  "....kkk.....",
  "...kkkkk....",
  "..kkkrrkk....",
  ".kkkrrrrkk....",
  ".kkkrrrrkk....",
  ".kkkrrrrkk....",
  "..kkkrrkk.....",
  "...kk.kk......",
  "....kk........",
  "...sss........",
  "..ssooss......",
  ".............."
];
const knucklesPaletteMap = { 'k': palette.knucklesRed, 'r': palette.flesh, 's': palette.shoeRed, '.': null };

// Eggman (background decor) - we will draw a simple Eggman silhouette when finale is active

// Start/stop
function startGame(){ if(running) return; if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); running = true; gameTime = 0; lastTime = performance.now(); score = 0; combo = 0; health = 100; settings = difficultySettings(difficultySel.value); generateNotes(0,6); scheduleChiptune(); updateHUD(); requestAnimationFrame(loop); }
function stopGame(){ running = false; }
startBtn.addEventListener('click', ()=>{ if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); startGame(); });
stopBtn.addEventListener('click', ()=> stopGame());

function updateHUD(){ scoreEl.textContent = `Score: ${score}`; comboEl.textContent = `Combo: ${combo}`; healthEl.textContent = `Health: ${Math.max(0, Math.round(health))}`; }

function loop(ts){ if(!running) return; const dt = (ts - lastTime)/1000; lastTime = ts; gameTime += dt; updateFX(dt); updateActors(dt); draw(); // judge missed notes using extended bad window
  const okW = settings.hitWindow; const badW = okW * 1.5;
  for(const n of notes){ if(!n.judged && (gameTime - n.beatTime) > badW){ n.judged = true; n.hit = false; combo = 0; health -= 7; spawnMissFX(n.lane); spawnRatingFX('OOF!', laneX[n.lane], laneYTarget - 36, '#ff5a5a'); updateHUD(); } }
  // automatically end finale visuals if time passed
  if(finale.active && audioCtx){ if(audioCtx.currentTime >= finale.endTime){ finale.active = false; knuckles.active = false; eggman.active = false; } }
  if(health <= 0){ running = false; setTimeout(()=> alert("You lost! Health depleted."), 50); return; } requestAnimationFrame(loop); }

function updateFX(dt){ hitFX.forEach(f=> f.t += dt); missFX.forEach(f=> f.t += dt); ratingFX.forEach(r=> r.t += dt); hitFX = hitFX.filter(f=> f.t < 0.6); missFX = missFX.filter(f=> f.t < 0.8); ratingFX = ratingFX.filter(r=> r.t < 1.0); }
function updateActors(dt){ sonic.anim += sonic.animDir * dt*6; if(sonic.anim > 3 || sonic.anim < 0) sonic.animDir *= -1; sonic.tauntTimer -= dt; if(Math.random() < 0.005) sonic.tauntTimer = 0.6; if(tails.active){ tails.anim += tails.animDir * dt*6; if(tails.anim>3||tails.anim<0) tails.animDir *= -1; if(tails.entranceTimer>0) tails.entranceTimer -= dt; } if(knuckles.active){ knuckles.anim += knuckles.animDir * dt*6; if(knuckles.anim>3||knuckles.anim<0) knuckles.animDir *= -1; if(knuckles.entranceTimer>0) knuckles.entranceTimer -= dt; } }

function draw(){ ctx.fillStyle = palette.bg; ctx.fillRect(0,0,W,H); ctx.fillStyle = palette.floor; ctx.fillRect(0, laneYTarget + 18, W, H - (laneYTarget+18)); // lanes
  for(const l of lanes){ const x = laneX[l]; ctx.fillStyle = '#112f45'; roundRect(ctx, x-28, 0, 56, laneYTarget+12, 6, true, false); ctx.strokeStyle = '#89c7ff'; ctx.lineWidth = 2; roundRect(ctx, x-24, laneYTarget-12, 48, 32, 6, false, true); ctx.fillStyle = palette.note; ctx.font = '12px monospace'; ctx.fillText(l[0].toUpperCase(), x-4, laneYTarget+6); }
  // notes
  for(const n of notes){ if(n.judged) continue; const t0 = n.spawnTime; const t1 = n.beatTime; const progress = Math.max(0, Math.min(1, (gameTime - t0) / (t1 - t0))); const y = progress * (laneYTarget); const x = laneX[n.lane]; const size = 16 - Math.abs(progress-0.5)*8; ctx.fillStyle = palette.note; ctx.fillRect(x - size/2, y - size/2, size, size); ctx.fillStyle = '#ffffff55'; ctx.fillRect(x - (size/6), y - (size/2.6), size/3, size/3); }

  // FX
  hitFX.forEach(f=>{ const a = 1 - (f.t/0.6); ctx.globalAlpha = a; ctx.fillStyle = palette.noteHit; circle(ctx, f.x, f.y-10 - f.t*30, 14*(1-a)); ctx.globalAlpha = 1; });
  missFX.forEach(f=>{ const a = 1 - (f.t/0.8); ctx.globalAlpha = a; ctx.fillStyle = palette.miss; circle(ctx, f.x, f.y-8 - f.t*20, 10*(1-a)); ctx.globalAlpha = 1; });

  // rating popups
  ratingFX.forEach(r=>{ const a = 1 - (r.t/1.0); ctx.globalAlpha = a; ctx.fillStyle = r.color || '#fff'; ctx.font = 'bold 14px monospace'; ctx.fillText(r.text, r.x - 16, r.y - (r.t*30)); ctx.globalAlpha = 1; });

  // If finale is active, draw Eggman in the background first (behind characters)
  if(finale.active || eggman.active){ drawEggmanBackground(); }

  // draw sprites (pixelated)
  drawPixelSprite(sonicSprite, sonicPaletteMap, sonic.x, sonic.y, 1.5);
  if(tails.active) drawPixelSprite(tailsSprite, tailsPaletteMap, tails.x, tails.y, 1.2);
  if(knuckles.active) drawPixelSprite(knucklesSprite, knucklesPaletteMap, knuckles.x, knuckles.y, 1.2);

  // finale label
  if(finale.active){ ctx.fillStyle = '#fff0a0'; ctx.font = 'bold 14px monospace'; ctx.fillText('TRIO FINALE!', W*0.44, H*0.12); }

  // HUD
  ctx.fillStyle = palette.text; ctx.font = '12px monospace'; ctx.fillText(`Score: ${score}`, 8, 16); ctx.fillText(`Combo: ${combo}`, 8, 30); ctx.fillText(`BPM: ${bpm}`, 8, 44);
}

function drawEggmanBackground(){ // simple stylized Eggman silhouette
  ctx.save();
  ctx.translate(eggman.x, eggman.y);
  // big round body
  ctx.fillStyle = palette.eggmanPurple;
  ctx.beginPath(); ctx.ellipse(0, 8, 40, 28, 0, 0, Math.PI*2); ctx.fill();
  // goggles & mustache
  ctx.fillStyle = '#fff'; ctx.fillRect(-18, -2, 12, 8); ctx.fillRect(6, -2, 12, 8);
  ctx.fillStyle = '#000'; ctx.fillRect(-14, 0, 6, 4); ctx.fillRect(10, 0, 6, 4);
  ctx.fillStyle = '#333'; ctx.fillRect(-10, 10, 20, 6);
  ctx.restore();
}

function drawPixelSprite(map, palMap, cx, cy, scale=1){ const px = 2 * scale; // adjust pixel size for sprite draw
  const h = map.length; const w = map[0].length; const startX = Math.round(cx - (w*px)/2); const startY = Math.round(cy - (h*px)/2);
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const key = map[y][x]; const col = palMap[key]; if(!col) continue; ctx.fillStyle = col; ctx.fillRect(startX + x*px, startY + y*px, px, px); } }
}

function roundRect(ctx, x, y, w, h, r, fill, stroke){ if (typeof r === 'undefined') r = 5; ctx.beginPath(); ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r); ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }
function circle(ctx,x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }

// Audio: simple chiptune scheduler
let scheduledOscillators = [];
function scheduleChiptune(){ if(!audioCtx) return; const now = audioCtx.currentTime + 0.05; const beatLength = 60/bpm; const totalBeats = 96; const baseFreq = 220; for(let i=0;i<totalBeats;i++){ const t = now + i*beatLength; const freq = baseFreq * Math.pow(2, ((i%8)-3)/12); scheduleChipNote(t, freq, 0.12); if(i%4===0) scheduleChipNote(t, 110, 0.18, 0.09); }
  // Tails duet roughly halfway
  const midpointBeat = Math.floor(totalBeats/2);
  const tailsStartTime = now + midpointBeat * beatLength;
  scheduleTailsDuet(tailsStartTime, beatLength, 8, baseFreq);
  const msUntilTailsEntrance = Math.max(0, (tailsStartTime - audioCtx.currentTime) * 1000);
  setTimeout(()=>{ tails.active = true; tails.entranceTimer = 1.0; setTimeout(()=>{ tails.active = false; }, 8 * beatLength * 1000 + 500); }, msUntilTailsEntrance);

  // Trio finale: schedule last ~30 seconds as a trio with Knuckles and Eggman jingle
  const totalDuration = totalBeats * beatLength; // seconds
  const trioDurationSec = 30; // final 30 seconds
  const trioStartTime = now + Math.max(0, totalDuration - trioDurationSec);
  const trioBeats = Math.ceil(trioDurationSec / beatLength);
  scheduleKnucklesTrio(trioStartTime, beatLength, trioBeats, baseFreq);
  scheduleEggmanBackgroundSound(trioStartTime, beatLength, trioBeats);

  // visual activations for trio
  const msUntilTrio = Math.max(0, (trioStartTime - audioCtx.currentTime) * 1000);
  setTimeout(()=>{
    finale.active = true;
    finale.startTime = audioCtx.currentTime;
    finale.endTime = finale.startTime + trioDurationSec;
    knuckles.active = true;
    knuckles.entranceTimer = 1.2;
    eggman.active = true;
    // make Tails stay visible during finale as well
    tails.active = true;
    setTimeout(()=>{ knuckles.active = false; tails.active = false; eggman.active = false; finale.active = false; }, trioDurationSec * 1000 + 500);
  }, msUntilTrio);
}

function playChipNote(timingAccuracy){ if(!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'square'; const freq = 800 - Math.min(600, timingAccuracy*4000); o.frequency.value = freq; g.gain.value = 0.0001; o.connect(g); g.connect(audioCtx.destination); const now = audioCtx.currentTime; g.gain.setTargetAtTime(0.15, now, 0.005); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12); o.start(now); o.stop(now + 0.13); }
function playMissBeep(){ if(!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'sawtooth'; o.frequency.value = 160; o.connect(g); g.connect(audioCtx.destination); const now = audioCtx.currentTime; g.gain.setTargetAtTime(0.12, now, 0.005); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18); o.start(now); o.stop(now + 0.2); }
function scheduleChipNote(t, freq, dur=0.12, gain=0.08){ if(!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'square'; o.frequency.value = freq; g.gain.value = 0.0001; o.connect(g); g.connect(audioCtx.destination); g.gain.setTargetAtTime(gain, t + 0.001, 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.02); scheduledOscillators.push(o); }

function scheduleTailsDuet(startTime, beatLength, beats, baseFreq){ if(!audioCtx) return; for(let i=0;i<beats;i++){ const t = startTime + i*beatLength; const offsetSemitones = (i%2===0) ? 4 : 7; const freq = baseFreq * Math.pow(2, ((i%8)-3 + offsetSemitones)/12); scheduleChipNote(t, freq, 0.16, 0.07); if(i%3===0){ const freq2 = freq * Math.pow(2, -5/12); scheduleChipNote(t + beatLength*0.25, freq2, 0.12, 0.05); } }
  const msToTaunt = Math.max(0, (startTime - audioCtx.currentTime)*1000); setTimeout(()=>{ sonic.tauntTimer = 1.2; }, msToTaunt);
}

function scheduleKnucklesTrio(startTime, beatLength, beats, baseFreq){ if(!audioCtx) return; // Knuckles voice: lower, punchy triangle-ish line
  for(let i=0;i<beats;i++){ const t = startTime + i*beatLength; const offsetSemitones = (i%3===0) ? -3 : 0; const freq = (baseFreq * 1.5) * Math.pow(2, ((i%8)-3 + offsetSemitones)/12); scheduleKnucklesNote(t, freq, 0.18, 0.09); // harmony hits
    if(i%4===0){ // occasional accent
      scheduleChipNote(t + beatLength*0.1, freq * Math.pow(2, -7/12), 0.12, 0.06);
    }
  }
  // encourage sonic taunt at start of finale
  const msToTaunt = Math.max(0, (startTime - audioCtx.currentTime)*1000);
  setTimeout(()=>{ sonic.tauntTimer = 1.6; }, msToTaunt);
}

function scheduleKnucklesNote(t, freq, dur=0.14, gain=0.09){ if(!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'triangle'; o.frequency.value = freq; g.gain.value = 0.0001; o.connect(g); g.connect(audioCtx.destination); g.gain.setTargetAtTime(gain, t + 0.001, 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.02); }

function scheduleEggmanBackgroundSound(startTime, beatLength, beats){ if(!audioCtx) return; // simple low thumps / synth pad to add drama
  for(let i=0;i<beats;i+=2){ const t = startTime + i*beatLength; scheduleChipNote(t, 80, 0.5, 0.06); }
}

// Initialize
updateHUD(); draw();
// Genesis-style rhythm prototype with pixel sprites for Sonic & Tails.
// Focus: 320x240 pixel canvas, limited palette, sprite-draw routines to mimic Genesis-era visuals.

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

function handleHit(lane){ const now = gameTime; let best=null, bestDT=Infinity; for(const n of notes){ if(n.lane!==lane || n.judged) continue; const dt = Math.abs(n.beatTime - now); if(dt < bestDT){ bestDT = dt; best = n; } } if(best && bestDT <= settings.hitWindow){ best.judged = true; best.hit = true; const hitScore = Math.round((1 - (bestDT/settings.hitWindow)) * 300) + 100; score += hitScore; combo += 1; health = Math.min(100, health + 2); spawnHitFX(best); playChipNote(bestDT); } else { combo = 0; health -= 5; spawnMissFX(lane); playMissBeep(); } updateHUD(); }

let hitFX = [];
let missFX = [];
function spawnHitFX(n){ hitFX.push({x:laneX[n.lane], y:laneYTarget, t:0}); }
function spawnMissFX(lane){ missFX.push({x:laneX[lane], y:laneYTarget+8, t:0}); }

// Actors
const sonic = { x: W*0.78, y: H*0.34, anim:0, animDir:1, tauntTimer:0 };
const tails = { x: W*0.92, y: H*0.40, anim:0, animDir:1, active:false, entranceTimer:0 };

// Sprites as pixel maps (small grids). Use characters for palette keys.
// Sonic: 16x16 sprite map (approx)
const sonicSprite = [
  "....bbbbbb....",
  "...bbrrrrbb...",
  "..bbrrrrrrbb..",
  ".bbrrrrrrrrbb.",
  ".bbrfffffrrbb.",
  "bbrfffffffrrbb",
  "bbrfffffffrrbb",
  "bbrfffffffrrbb",
  ".bbrfffffrrbb.",
  "..bbrrrrrrbb..",
  "...bbrrbb.....",
  "....bbbb......",
  "....b..b......",
  "...sss..sss...",
  "..sso....oss..",
  "..............."
];
// Palette mapping for sprite: b=blue, r=flesh, f=face flesh, s=shoe
const sonicPaletteMap = { 'b': palette.sonicBlue, 'r': palette.flesh, 'f': palette.flesh, 's': palette.shoeRed, '.': null };

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

// Start/stop
function startGame(){ if(running) return; if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); running = true; gameTime = 0; lastTime = performance.now(); score = 0; combo = 0; health = 100; settings = difficultySettings(difficultySel.value); generateNotes(0,6); scheduleChiptune(); updateHUD(); requestAnimationFrame(loop); }
function stopGame(){ running = false; }
startBtn.addEventListener('click', ()=>{ if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); startGame(); });
stopBtn.addEventListener('click', ()=> stopGame());

function updateHUD(){ scoreEl.textContent = `Score: ${score}`; comboEl.textContent = `Combo: ${combo}`; healthEl.textContent = `Health: ${Math.max(0, Math.round(health))}`; }

function loop(ts){ if(!running) return; const dt = (ts - lastTime)/1000; lastTime = ts; gameTime += dt; updateFX(dt); updateActors(dt); draw(); for(const n of notes){ if(!n.judged && (gameTime - n.beatTime) > settings.hitWindow){ n.judged = true; n.hit = false; combo = 0; health -= 7; spawnMissFX(n.lane); updateHUD(); } } if(health <= 0){ running = false; setTimeout(()=> alert("You lost! Health depleted."), 50); return; } requestAnimationFrame(loop); }

function updateFX(dt){ hitFX.forEach(f=> f.t += dt); missFX.forEach(f=> f.t += dt); hitFX = hitFX.filter(f=> f.t < 0.6); missFX = missFX.filter(f=> f.t < 0.8); }
function updateActors(dt){ sonic.anim += sonic.animDir * dt*6; if(sonic.anim > 3 || sonic.anim < 0) sonic.animDir *= -1; sonic.tauntTimer -= dt; if(Math.random() < 0.005) sonic.tauntTimer = 0.6; if(tails.active){ tails.anim += tails.animDir * dt*6; if(tails.anim>3||tails.anim<0) tails.animDir *= -1; if(tails.entranceTimer>0) tails.entranceTimer -= dt; } }

function draw(){ ctx.fillStyle = palette.bg; ctx.fillRect(0,0,W,H); ctx.fillStyle = palette.floor; ctx.fillRect(0, laneYTarget + 18, W, H - (laneYTarget+18)); // lanes
  for(const l of lanes){ const x = laneX[l]; ctx.fillStyle = '#112f45'; roundRect(ctx, x-28, 0, 56, laneYTarget+12, 6, true, false); ctx.strokeStyle = '#89c7ff'; ctx.lineWidth = 2; roundRect(ctx, x-24, laneYTarget-12, 48, 32, 6, false, true); ctx.fillStyle = palette.note; ctx.font = '12px monospace'; ctx.fillText(l[0].toUpperCase(), x-4, laneYTarget+6); }
  // notes
  for(const n of notes){ if(n.judged) continue; const t0 = n.spawnTime; const t1 = n.beatTime; const progress = Math.max(0, Math.min(1, (gameTime - t0) / (t1 - t0))); const y = progress * (laneYTarget); const x = laneX[n.lane]; const size = 16 - Math.abs(progress-0.5)*8; ctx.fillStyle = palette.note; ctx.fillRect(x - size/2, y - size/2, size, size); ctx.fillStyle = '#ffffff55'; ctx.fillRect(x - (size/6), y - (size/2.6), size/3, size/3); }

  // FX
  hitFX.forEach(f=>{ const a = 1 - (f.t/0.6); ctx.globalAlpha = a; ctx.fillStyle = palette.noteHit; circle(ctx, f.x, f.y-10 - f.t*30, 14*(1-a)); ctx.globalAlpha = 1; });
  missFX.forEach(f=>{ const a = 1 - (f.t/0.8); ctx.globalAlpha = a; ctx.fillStyle = palette.miss; circle(ctx, f.x, f.y-8 - f.t*20, 10*(1-a)); ctx.globalAlpha = 1; });

  // draw sprites (pixelated)
  drawPixelSprite(sonicSprite, sonicPaletteMap, sonic.x, sonic.y, 1.5);
  if(tails.active) drawPixelSprite(tailsSprite, tailsPaletteMap, tails.x, tails.y, 1.2);

  // HUD
  ctx.fillStyle = palette.text; ctx.font = '12px monospace'; ctx.fillText(`Score: ${score}`, 8, 16); ctx.fillText(`Combo: ${combo}`, 8, 30); ctx.fillText(`BPM: ${bpm}`, 8, 44);
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
  // Tails duet
  const midpointBeat = Math.floor(totalBeats/2);
  const tailsStartTime = now + midpointBeat * beatLength;
  scheduleTailsDuet(tailsStartTime, beatLength, 8, baseFreq);
  const msUntilEntrance = Math.max(0, (tailsStartTime - audioCtx.currentTime) * 1000);
  setTimeout(()=>{ tails.active = true; tails.entranceTimer = 1.0; setTimeout(()=>{ tails.active = false; }, 8 * beatLength * 1000 + 500); }, msUntilEntrance);
}

function playChipNote(timingAccuracy){ if(!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'square'; const freq = 800 - Math.min(600, timingAccuracy*4000); o.frequency.value = freq; g.gain.value = 0.0001; o.connect(g); g.connect(audioCtx.destination); const now = audioCtx.currentTime; g.gain.setTargetAtTime(0.15, now, 0.005); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12); o.start(now); o.stop(now + 0.13); }
function playMissBeep(){ if(!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'sawtooth'; o.frequency.value = 160; o.connect(g); g.connect(audioCtx.destination); const now = audioCtx.currentTime; g.gain.setTargetAtTime(0.12, now, 0.005); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18); o.start(now); o.stop(now + 0.2); }
function scheduleChipNote(t, freq, dur=0.12, gain=0.08){ if(!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'square'; o.frequency.value = freq; g.gain.value = 0.0001; o.connect(g); g.connect(audioCtx.destination); g.gain.setTargetAtTime(gain, t + 0.001, 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.02); scheduledOscillators.push(o); }

function scheduleTailsDuet(startTime, beatLength, beats, baseFreq){ if(!audioCtx) return; for(let i=0;i<beats;i++){ const t = startTime + i*beatLength; const offsetSemitones = (i%2===0) ? 4 : 7; const freq = baseFreq * Math.pow(2, ((i%8)-3 + offsetSemitones)/12); scheduleChipNote(t, freq, 0.16, 0.07); if(i%3===0){ const freq2 = freq * Math.pow(2, -5/12); scheduleChipNote(t + beatLength*0.25, freq2, 0.12, 0.05); } }
  const msToTaunt = Math.max(0, (startTime - audioCtx.currentTime)*1000);
  setTimeout(()=>{ sonic.tauntTimer = 1.2; }, msToTaunt);
}

// Initialize
updateHUD(); draw();

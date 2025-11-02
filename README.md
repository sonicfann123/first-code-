# Genesis Rhythm Rumble — Fan Prototype

This is a small browser-based rhythm game prototype with a Genesis/retro aesthetic. It features a stylized pixel opponent labeled "Sonic" (fan content) and a short cameo/duet from "Tails" approximately halfway through the song.

How to run
1. Put the files (index.html, style.css, game.js) in a folder.
2. Open `index.html` in a modern browser (Chrome, Firefox, Edge). No server required.
3. Click Start and use the arrow keys to hit notes.

Controls
- Arrow keys: Hit corresponding notes.
- BPM slider: Change tempo.
- Difficulty: Adjust note speed and spawn timing.
- Start/Stop: Control play.

Genesis-era notes
- Low-res canvas (320×240) scaled up with pixelated rendering for a Genesis-era look.
- Palette and sprite drawing use chunky pixels and limited colors to evoke Sega Genesis style.
- Chiptune-like audio uses WebAudio oscillators to mimic retro square-like sounds. For production-quality Genesis music you'd replace this with tracker modules (MOD/IT) or sampled audio.

Tails duet
- About halfway through the scheduled chiptune sequence, Tails will enter and perform a short harmonic duet with Sonic.
- The duet is scheduled in the audio context so timing stays synchronized with the beats; a Tails visual and a short message appear during the duet.

License & IP
- This is fan-made prototype code. Sonic and Tails are trademarks of SEGA. Use responsibly.

If you'd like:
- I can push these files into your repository `sonicfann123/first-code-` on the `demo-rhythm` branch (done).
- Replace the stylized characters with authentic pixel art sprites you provide.
- Add multiple songs/tracker module support (MOD/MIDI), improved scoring, Perfect/Great/Good judgments, or recording of replays.

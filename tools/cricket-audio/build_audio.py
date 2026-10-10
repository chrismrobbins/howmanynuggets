# Nugget Cricket: src/ (raw ElevenLabs downloads) → audio/cricket/music/ + index.json (tools/blitz-vo/build_music.py, re-listed).
#   loops: cut on the beat grid (librosa), a whole number of bars, before the track's own ending,
#          with the seam crossfaded; loop points go in the manifest (a little audio either side of
#          them, so an MP3 encoder's padding can never land inside the loop)
#   one-shots: trimmed, loudness-matched
# Runs in a venv with librosa + soundfile (no API calls, no credits).
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import json, subprocess
import numpy as np, librosa, soundfile as sf
REPO = os.path.abspath('../..'); OUT = os.path.join(REPO, 'audio', 'cricket', 'music')
LOOPS = ['match']
ONESHOT = ['win', 'lose', 'bat', 'edge', 'stumps', 'catch', 'pad', 'four', 'six', 'wicket', 'cr-roar', 'cr-aww', 'cr-appeal']
SR = 44100; PRE = 0.25; XF = 0.08
def loud(y, target):
    # loudness as the RMS of the louder half of the blocks: good enough to match the tracks to each other
    mono = y.mean(1) if y.ndim > 1 else y
    blk = mono[: len(mono) // 2048 * 2048].reshape(-1, 2048)
    r = np.sqrt((blk ** 2).mean(1)); r = np.sort(r)[len(r) // 2:]
    cur = 20 * np.log10(np.sqrt((r ** 2).mean()) + 1e-9)
    g = 10 ** ((target - cur) / 20)
    y = y * g
    pk = np.abs(y).max()
    return y * (0.95 / pk) if pk > 0.95 else y
def enc(y, name, kbps, ch):
    tmp = os.path.join(OUT, '_' + name + '.wav')
    sf.write(tmp, y, SR)
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-i', tmp, '-ac', str(ch), '-b:a', f'{kbps}k', os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(tmp)
man = {'loops': {}, 'shots': {}}
for k in LOOPS:
    y, _ = librosa.load(f'src/{k}.mp3', sr=SR, mono=False)
    y = y.T if y.ndim > 1 else y[:, None]                      # (n, ch)
    mono = y.mean(1)
    tempo, beats = librosa.beat.beat_track(y=librosa.resample(mono, orig_sr=SR, target_sr=22050), sr=22050)
    bt = librosa.frames_to_time(beats, sr=22050)
    hop = SR // 2; rms = np.array([np.sqrt((mono[i:i + hop] ** 2).mean()) for i in range(0, len(mono) - hop, hop)])
    loud_idx = np.where(rms > 0.06)[0]
    end_lim = min((loud_idx[-1]) * 0.5, len(mono) / SR - 3.0)   # stay clear of the track's own ending
    i0 = int(np.argmax(bt >= 1.0))                               # skip any intro
    cands = [j for j in range(i0 + 16, len(bt)) if bt[j] <= end_lim and (j - i0) % 8 == 0]
    j = cands[-1]
    s, e = bt[i0], bt[j]
    a, b = int((s - PRE) * SR), int((e + PRE) * SR)
    seg = y[max(0, a):b].copy()
    s_i, e_i = int(s * SR) - max(0, a), int(e * SR) - max(0, a)
    # the seam: the last XF before the loop end blends into what plays just before the loop start
    n = int(XF * SR); w = np.linspace(0, 1, n)[:, None]
    seg[e_i - n:e_i] = seg[e_i - n:e_i] * (1 - w) + seg[s_i - n:s_i] * w
    # …and past the loop end, the loop's own beginning: then the seam is seamless however far a decoder's
    # MP3 padding shifts the loop points (up to PRE)
    m = min(len(seg) - e_i, int(PRE * SR)); seg[e_i:e_i + m] = seg[s_i:s_i + m]
    seg = loud(seg, -15)
    enc(seg, k, 112, 2)
    man['loops'][k] = {'file': k + '.mp3', 'start': round(s_i / SR, 4), 'end': round(e_i / SR, 4), 'bpm': round(float(np.atleast_1d(tempo)[0]), 1), 'bars': (j - i0) // 4}
    print(k, f'loop {s:.2f}-{e:.2f}s = {(e - s):.1f}s, {(j - i0)} beats @ {float(np.atleast_1d(tempo)[0]):.0f} BPM')
for k in ONESHOT:
    y, _ = librosa.load(f'src/{k}.mp3', sr=SR, mono=False)
    y = y.T if y.ndim > 1 else y
    mono = y.mean(1) if y.ndim > 1 else y
    env = np.abs(mono); thr = env.max() * 0.02
    idx = np.where(env > thr)[0]
    y = y[max(0, idx[0] - int(0.01 * SR)): min(len(mono), idx[-1] + int(0.15 * SR))]
    y = loud(y, -15 if k in ('win', 'lose') else -16)
    f = int(0.01 * SR); fade = np.linspace(1, 0, f); y[-f:] = (y[-f:].T * fade).T
    stereo = k in ('win', 'lose')
    enc(y if stereo or y.ndim == 1 else y.mean(1), k, 112 if stereo else 96, 2 if stereo else 1)
    man['shots'][k] = {'file': k + '.mp3', 'dur': round(len(y) / SR, 2)}
json.dump(man, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('manifest ok;', len(os.listdir(OUT)), 'files,', round(tot / 1e6, 2), 'MB')

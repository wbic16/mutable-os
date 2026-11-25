"""Build the timed mono voice track. See implementation.md for the model and mix."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


def trim_silence(samples, rate):
    # Keep breath and release tails, including unvoiced final consonants.
    active = np.flatnonzero(np.abs(samples) > 0.003)
    if not active.size:
        raise ValueError("Speech generator returned an empty cue")
    return samples[max(0, active[0] - int(.04 * rate)):active[-1] + int(.14 * rate) + 1]


def encode_studio_audio(track, rate, output, ffmpeg):
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        raw = Path(tmp) / "track.wav"
        encoded = Path(tmp) / "track.m4a"
        sf.write(raw, track, rate, subtype="PCM_24")
        command = [ffmpeg, "-hide_banner", "-nostdin", "-i", str(raw)]
        target = "loudnorm=I=-16:LRA=9:TP=-2"
        scan = subprocess.run(command + ["-af", target + ":print_format=json", "-f", "null", "-"],
                              capture_output=True, text=True, check=True)
        levels, _ = json.JSONDecoder().raw_decode(scan.stderr[scan.stderr.rindex("{"):])
        measured = {"measured_I": "input_i", "measured_TP": "input_tp", "measured_LRA": "input_lra",
                    "measured_thresh": "input_thresh", "offset": "target_offset"}
        params = ":".join(f"{field}={levels[key]}" for field, key in measured.items())
        subprocess.run(command + ["-af", target + ":linear=true:" + params, "-ar", "48000",
                                  "-ac", "1", "-c:a", "aac", "-b:a", "192k", "-movflags",
                                  "+faststart", str(encoded)], check=True)
        encoded.replace(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model_dir", type=Path)
    parser.add_argument("output_m4a", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--episode-dir", type=Path, default=Path(__file__).parent,
                        help="Directory containing scenes.json and metadata.json")
    args = parser.parse_args()
    here = args.episode_dir
    scenes = json.loads((here / "scenes.json").read_text())
    duration = json.loads((here / "metadata.json").read_text())["durationSeconds"]
    engine = Kokoro(str(args.model_dir / "kokoro-v1.0.onnx"),
                    str(args.model_dir / "voices-v1.0.bin"))
    rate = 24000
    track = np.zeros(duration * rate, dtype=np.float32)
    overruns = []
    for scene in scenes:
        start = scene["start"]
        cues = scene["narration"]
        for i, cue in enumerate(cues):
            at = cue["at"]
            until = cues[i + 1]["at"] if i + 1 < len(cues) else scene["duration"]
            samples, sr = engine.create(cue["text"], voice="bf_emma", lang="en-gb", speed=1.0)
            if sr != rate:
                raise ValueError(f"Unexpected synthesis sample rate {sr}")
            samples = trim_silence(samples, rate)
            window = until - at
            length = len(samples) / rate
            print(f'{scene["id"]:20} {start + at:6.2f}s  {length:.2f}s of {window:.2f}s', flush=True)
            if length > window - .08:
                overruns.append(cue["text"])
                continue
            offset = round((start + at) * rate)
            track[offset:offset + len(samples)] = samples
    if overruns:
        raise ValueError("Cues need more room: " + " / ".join(overruns))
    encode_studio_audio(track, rate, args.output_m4a, args.ffmpeg)


if __name__ == "__main__":
    main()

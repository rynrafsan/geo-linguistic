"""Turns one audio file into dialect / gender / age predictions with honest confidence.

What it adds on top of the notebook's single-clip demo:
  * clips longer than 5 s are scored in overlapping 5 s windows and averaged; leading and trailing
    silence is trimmed and windows that are mostly silence are left out of the average;
  * confidences are temperature-calibrated (values in model/calibration.json), and an optional
    per-class logit bias (e.g. the age cut-off chosen on Common Voice validation) is applied;
  * an unknown-voice check: the clip's shared embedding is compared with reference points of the
    training data (v3.1: the nine RBVD voices; V4: the eight districts). A clip far from all of
    them gets status "unknown_voice", because the dialect answer is not trustworthy there.
"""
import json
import os
import tempfile

import numpy as np
import torch
import torch.nn.functional as F

from .audio import SAMPLE_RATE, TARGET_LEN, decode_audio, extract_features, speech_level, windows_of
from .model import load_checkpoint

DIALECTS = [
    {"id": "Chottogram", "en": "Chattogram", "bn": "চট্টগ্রাম", "lat": 22.3758, "lon": 91.8317},
    {"id": "Barishal", "en": "Barishal", "bn": "বরিশাল", "lat": 22.7016, "lon": 90.3535},
    {"id": "Rangpur", "en": "Rangpur", "bn": "রংপুর", "lat": 25.7491, "lon": 89.2597},
    {"id": "Noakhali", "en": "Noakhali", "bn": "নোয়াখালী", "lat": 22.8634, "lon": 91.0960},
    {"id": "Mymensingh", "en": "Mymensingh", "bn": "ময়মনসিংহ", "lat": 24.7461, "lon": 90.4175},
    {"id": "Tangail", "en": "Tangail", "bn": "টাঙ্গাইল", "lat": 24.2514, "lon": 89.9197},
    {"id": "Jamalpur", "en": "Jamalpur", "bn": "জামালপুর", "lat": 24.9253, "lon": 89.9485},
    {"id": "Natore", "en": "Natore", "bn": "নাটোর", "lat": 24.4102, "lon": 88.9897},
]
GENDERS = [{"id": "Male", "en": "Male", "bn": "পুরুষ"}, {"id": "Female", "en": "Female", "bn": "নারী"}]
AGE_GROUPS = {
    2: [{"id": "Young", "en": "Young (under 30)", "bn": "তরুণ (৩০-এর কম)"},
        {"id": "Adult", "en": "Adult (30+)", "bn": "প্রাপ্তবয়স্ক (৩০+)"}],
    3: [{"id": "Young", "en": "Young (under 30)", "bn": "তরুণ"},
        {"id": "Adult", "en": "Adult (30-59)", "bn": "প্রাপ্তবয়স্ক"},
        {"id": "Senior", "en": "Senior (60+)", "bn": "প্রবীণ"}],
}

DEFAULT_CALIBRATION = {
    "temperature": {"dialect": 1.0, "gender": 1.0, "age": 1.0},
    "logit_bias": {},                # e.g. {"age": [0.0, -0.4]}: added to the calibrated logits
    "min_confidence": {"dialect": 0.60, "gender": 0.65, "age": 0.60},
    "unknown_voice": None,           # filled by tools/calibrate.py
    "calibrated_on": "not calibrated yet",
}
MIN_SECONDS = 1.0
MAX_SECONDS = 60.0
SILENCE_DBFS = -50.0
FRAME_S, FRAME_HOP_S = 0.03, 0.01      # silence detection frames
SPEECH_BELOW_PEAK_DB = 30.0            # a frame is speech if within 30 dB of the clip's loud frames
MIN_SPEECH_FRACTION = 0.25             # windows with less speech than this are left out


class InputError(ValueError):
    """A problem with the uploaded audio that the person can fix."""


class Predictor:
    def __init__(self, model_dir):
        ckpt_path = os.path.join(model_dir, "model.pt")
        if not os.path.exists(ckpt_path):
            raise FileNotFoundError(f"Trained model not found at {ckpt_path}. Copy v31_best_model.pt there as model.pt.")
        self.model, self.ckpt_meta = load_checkpoint(ckpt_path)
        torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))

        cal_path = os.path.join(model_dir, "calibration.json")
        self.calibration = dict(DEFAULT_CALIBRATION)
        if os.path.exists(cal_path):
            with open(cal_path, encoding="utf-8") as f:
                self.calibration.update(json.load(f))

        ref_path = os.path.join(model_dir, "voice_reference.npz")
        self.ref = None
        if os.path.exists(ref_path) and self.calibration.get("unknown_voice"):
            z = np.load(ref_path)
            self.ref = {"centroids": torch.from_numpy(z["centroids"]).float(),
                        "precision": torch.from_numpy(z["precision"]).float(),
                        "voices": [str(v) for v in z["voices"]]}

        n_age = self.model.age_head.out_features
        self.age_groups = AGE_GROUPS.get(n_age, [{"id": f"group{i}", "en": f"Group {i}", "bn": ""} for i in range(n_age)])

    # ------------------------------------------------------------------ scoring
    @staticmethod
    def _frame_db(y):
        n = int(FRAME_S * SAMPLE_RATE); hop = int(FRAME_HOP_S * SAMPLE_RATE)
        if len(y) < n:
            return np.array([speech_level(y)]), hop
        idx = np.arange(0, len(y) - n + 1, hop)
        frames = np.lib.stride_tricks.sliding_window_view(y, n)[idx]
        return 10 * np.log10(np.mean(frames ** 2, axis=1) + 1e-12), hop

    def _speech_windows(self, y):
        """5 s windows that contain speech. Long recordings only: short clips keep the training behaviour."""
        db, hop = self._frame_db(y)
        thr = max(SILENCE_DBFS, float(np.percentile(db, 95)) - SPEECH_BELOW_PEAK_DB)
        speech = db > thr
        if len(y) > TARGET_LEN and speech.any():
            first, last = int(np.argmax(speech)), len(speech) - 1 - int(np.argmax(speech[::-1]))
            pad = int(0.2 * SAMPLE_RATE)
            a, b = max(0, first * hop - pad), min(len(y), last * hop + int(FRAME_S * SAMPLE_RATE) + pad)
            y = y[a:b]
            db, hop = self._frame_db(y); speech = db > thr
        wins = windows_of(y)
        if len(wins) == 1:
            return wins, 1
        starts = list(range(0, len(y) - TARGET_LEN + 1, int(2.5 * SAMPLE_RATE)))
        if starts[-1] != len(y) - TARGET_LEN:
            starts.append(len(y) - TARGET_LEN)
        frac = [speech[s // hop:(s + TARGET_LEN) // hop].mean() if len(speech[s // hop:(s + TARGET_LEN) // hop]) else 0.0
                for s in starts]
        keep = [w for w, f in zip(wins, frac) if f >= MIN_SPEECH_FRACTION]
        if not keep:
            keep = [wins[int(np.argmax(frac))]]
        return keep, len(wins)

    @torch.no_grad()
    def _score(self, y):
        wins, n_total = self._speech_windows(y)
        feats = [extract_features(w) for w in wins]
        spec = torch.stack([s for s, _ in feats])
        mfcc = torch.stack([m for _, m in feats])
        h = self.model.embed(spec, mfcc)
        logits = {"dialect": self.model.dialect_head(h), "gender": self.model.gender_head(h), "age": self.model.age_head(h)}
        probs = {}
        for task, lg in logits.items():
            t = float(self.calibration["temperature"].get(task, 1.0))
            z = lg / t
            bias = (self.calibration.get("logit_bias") or {}).get(task)
            if bias is not None and len(bias) == z.shape[1]:
                z = z + torch.tensor(bias, dtype=z.dtype)
            probs[task] = F.softmax(z, dim=1).mean(dim=0)     # average over windows
        return probs, h, len(feats), n_total

    def _unknown_voice_score(self, h):
        """Smallest Mahalanobis distance from the clip's mean embedding to a known RBVD voice."""
        if self.ref is None:
            return None, None
        e = h.mean(dim=0, keepdim=True)
        diff = e - self.ref["centroids"]                              # (n_voices, 128)
        d2 = torch.einsum("vi,ij,vj->v", diff, self.ref["precision"], diff).clamp_min(0)
        d = d2.sqrt()
        k = int(d.argmin())
        return float(d[k]), self.ref["voices"][k]

    # ------------------------------------------------------------------ public
    def predict_file(self, path):
        try:
            y = decode_audio(path)
        except Exception as e:
            raise InputError("This file could not be read as audio. Upload a WAV, MP3, M4A or OGG recording.") from e
        seconds = len(y) / SAMPLE_RATE
        if seconds < MIN_SECONDS:
            raise InputError(f"The recording is {seconds:.1f} s long. Speak for at least {MIN_SECONDS:.0f} seconds.")
        if seconds > MAX_SECONDS:
            y = y[: int(MAX_SECONDS * SAMPLE_RATE)]
        level = speech_level(y)
        if level < SILENCE_DBFS:
            raise InputError("The recording is almost silent. Move closer to the microphone and record again.")

        probs, h, n_windows, n_total = self._score(y)
        dist, nearest = self._unknown_voice_score(h)
        cal = self.calibration
        uv = cal.get("unknown_voice") or {}
        is_unknown = dist is not None and dist > float(uv.get("threshold", float("inf")))

        out = {"audio": {"seconds": round(min(seconds, MAX_SECONDS), 2), "windows": n_windows,
                         "windows_total": n_total, "level_dbfs": round(level, 1)}}
        for task, labels in (("dialect", DIALECTS), ("gender", GENDERS), ("age", self.age_groups)):
            p = probs[task].tolist()
            order = sorted(range(len(p)), key=lambda i: -p[i])
            best = order[0]
            status = "confident" if p[best] >= cal["min_confidence"][task] else "unsure"
            if task == "dialect" and is_unknown:
                status = "unknown_voice"
            out[task] = {
                "prediction": labels[best]["id"],
                "confidence": round(p[best], 4),
                "status": status,
                "scores": [{**labels[i], "probability": round(p[i], 4)} for i in order],
            }
        out["voice_check"] = {
            "available": dist is not None,
            "distance": None if dist is None else round(dist, 2),
            "threshold": uv.get("threshold"),
            "nearest_known_voice": nearest,
            "known_voice": None if dist is None else (not is_unknown),
        }
        out["calibration"] = cal.get("calibrated_on", "")
        return out

    def predict_bytes(self, data, suffix):
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            return self.predict_file(tmp)
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass

    def info(self):
        return {
            "dialects": DIALECTS,
            "genders": GENDERS,
            "age_groups": self.age_groups,
            "unknown_voice_check": self.ref is not None,
            "calibration": self.calibration.get("calibrated_on", ""),
            "calibration_detail": {"min_confidence": self.calibration["min_confidence"],
                                   "temperature": self.calibration["temperature"],
                                   "logit_bias": self.calibration.get("logit_bias") or {}},
            # optional page text written by the training notebook (falls back to the HTML defaults)
            "model_name": self.calibration.get("model_name"),
            "model_card": self.calibration.get("model_card"),
            "limits": self.calibration.get("limits"),
            "unknown_voice_text": self.calibration.get("unknown_voice_text"),
            "checkpoint": {k: v for k, v in self.ckpt_meta.items() if isinstance(v, (int, float, str))},
        }

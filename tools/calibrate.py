"""Calibrate the web service's confidences and its unknown-voice check.

Uses only what the thesis already uses: RBVD dialect labels (and folder = speaker),
plus, optionally, a Common Voice manifest with gender/age labels. No RBVD gender or
age label is read.

    python tools/calibrate.py --rbvd "path/to/RBVD Regional Bangla Voice Dataset"
    python tools/calibrate.py --rbvd ... --cv-val cv_val.csv --cv-test cv_test.csv --ood ood_clips.csv

Writes model/calibration.json and model/voice_reference.npz, and prints a report.

Steps
  1. Rebuild the notebook's sentence-disjoint RBVD split (seed 42: 744 / 162 / 161 clips).
  2. Dialect temperature: fitted on the RBVD validation split (minimises negative log-likelihood).
  3. Known voices: mean embedding of each of the nine RBVD speakers (training split) and a
     shared, shrunk covariance -> Mahalanobis distance of a clip to its nearest known voice.
     Threshold = 95th percentile of the validation clips' distances (about 3% false alarms
     on known speakers; the 99th let most confident wrong answers on new speakers through). Checked on the test split; and on --ood clips (other speakers),
     where every clip should be flagged.
  4. Gender/age temperature: fitted on --cv-val if given; metrics reported on --cv-test.
"""
import argparse
import glob
import json
import os
import re
import sys
import time

import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F
from sklearn.covariance import LedoitWolf
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.model_selection import GroupShuffleSplit

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.audio import decode_audio, extract_features, windows_of  # noqa: E402
from app.model import load_checkpoint  # noqa: E402

DIALECT_CLASSES = ["Chottogram", "Barishal", "Rangpur", "Noakhali", "Mymensingh", "Tangail", "Jamalpur", "Natore"]
SEED = 42


def rbvd_manifest(root):
    rows = []
    for folder in sorted(os.listdir(root)):
        p = os.path.join(root, folder)
        if not os.path.isdir(p):
            continue
        dialect = "Rangpur" if folder.startswith("Rangpur") else folder
        if dialect not in DIALECT_CLASSES:
            continue
        for fp in sorted(glob.glob(os.path.join(p, "*.wav")) + glob.glob(os.path.join(p, "*.mp3"))):
            n = os.path.basename(fp)
            m = re.search(r"\((\d+)\)", n) or re.search(r"(\d+)(?=\.[A-Za-z0-9]+$)", n)
            rows.append({"filepath": fp, "folder": folder, "dialect": DIALECT_CLASSES.index(dialect),
                         "sentence_id": int(m.group(1)) if m else -1})
    df = pd.DataFrame(rows)
    idx = np.arange(len(df)); g = df["sentence_id"].values
    trv, te = next(GroupShuffleSplit(1, test_size=0.15, random_state=SEED).split(idx, groups=g))
    tr, va = next(GroupShuffleSplit(1, test_size=0.15 / 0.85, random_state=SEED).split(trv, groups=g[trv]))
    df["split"] = "train"
    df.loc[trv[va], "split"] = "val"
    df.loc[te, "split"] = "test"
    return df


@torch.no_grad()
def run(model, paths, every=100):
    embs, logits = [], {"dialect": [], "gender": [], "age": []}
    t0 = time.time()
    for i, fp in enumerate(paths):
        feats = [extract_features(w) for w in windows_of(decode_audio(fp))]
        spec = torch.stack([s for s, _ in feats]); mfcc = torch.stack([m for _, m in feats])
        h = model.embed(spec, mfcc)
        embs.append(h.mean(0).numpy())
        logits["dialect"].append(model.dialect_head(h).mean(0).numpy())
        logits["gender"].append(model.gender_head(h).mean(0).numpy())
        logits["age"].append(model.age_head(h).mean(0).numpy())
        if (i + 1) % every == 0:
            print(f"   {i + 1}/{len(paths)} clips ({time.time() - t0:.0f} s)")
    return np.stack(embs), {k: np.stack(v) for k, v in logits.items()}


def fit_temperature(logits, y):
    """Temperature that minimises NLL on held-out clips.

    If every held-out clip is already classified correctly, NLL keeps falling as T -> 0, so the fit
    would make the model *more* overconfident. Temperature is not identifiable then, and 1.0
    (no change) is returned. Otherwise T is kept in [0.25, 20].
    """
    if np.all(np.asarray(logits).argmax(1) == np.asarray(y)):
        return 1.0
    lg = torch.tensor(np.asarray(logits), dtype=torch.float32); yt = torch.tensor(np.asarray(y), dtype=torch.long)
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200)

    def closure():
        opt.zero_grad(); loss = F.cross_entropy(lg / log_t.exp(), yt); loss.backward(); return loss
    opt.step(closure)
    return float(log_t.detach().exp().clamp(0.25, 20.0))


def ece(probs, y, bins=10):
    conf = probs.max(1); pred = probs.argmax(1); acc = (pred == y).astype(float)
    edges = np.linspace(0, 1, bins + 1); e = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            e += m.mean() * abs(acc[m].mean() - conf[m].mean())
    return float(e)


def softmax(x, t=1.0):
    z = x / t; z = z - z.max(1, keepdims=True); e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def mahalanobis_min(E, centroids, precision):
    d = E[:, None, :] - centroids[None, :, :]
    d2 = np.einsum("nvi,ij,nvj->nv", d, precision, d)
    return np.sqrt(np.clip(d2, 0, None)).min(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default="model/model.pt")
    ap.add_argument("--rbvd", required=True)
    ap.add_argument("--out", default="model")
    ap.add_argument("--cv-val", help="CSV with filepath,gender,age (Common Voice validation split)")
    ap.add_argument("--cv-test", help="CSV with filepath,gender,age (Common Voice test split)")
    ap.add_argument("--ood", help="CSV with a filepath column: clips from speakers NOT in RBVD")
    ap.add_argument("--percentile", type=float, default=95.0)
    a = ap.parse_args()

    model, _ = load_checkpoint(a.checkpoint)
    torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))
    df = rbvd_manifest(a.rbvd)
    print("RBVD split:", df["split"].value_counts().to_dict())
    print("Embedding all RBVD clips...")
    E, L = run(model, df["filepath"].tolist())
    report = {}

    # ---- dialect temperature ----
    va, te, tr = (df["split"] == s for s in ("val", "test", "train"))
    y = df["dialect"].values
    t_d = fit_temperature(L["dialect"][va], y[va])
    p_raw, p_cal = softmax(L["dialect"][te]), softmax(L["dialect"][te], t_d)
    report["dialect"] = {"temperature": t_d,
                         "test_macro_f1": float(f1_score(y[te], p_cal.argmax(1), average="macro")),
                         "test_accuracy": float(accuracy_score(y[te], p_cal.argmax(1))),
                         "test_ece_before": ece(p_raw, y[te]), "test_ece_after": ece(p_cal, y[te])}

    # ---- known-voice reference (folder = speaker; 9 voices) ----
    voices = sorted(df["folder"].unique())
    cents = np.stack([E[(tr & (df["folder"] == v)).values].mean(0) for v in voices])
    resid = np.concatenate([E[(tr & (df["folder"] == v)).values] - cents[i] for i, v in enumerate(voices)])
    precision = np.linalg.inv(LedoitWolf().fit(resid).covariance_)
    d_val = mahalanobis_min(E[va.values], cents, precision)
    d_test = mahalanobis_min(E[te.values], cents, precision)
    thr = float(np.percentile(d_val, a.percentile))
    report["unknown_voice"] = {"threshold": thr, "percentile": a.percentile,
                               "known_voice_test_false_alarm": float((d_test > thr).mean()),
                               "val_distance_median": float(np.median(d_val))}

    # ---- optional: other speakers (should all be flagged) ----
    if a.ood:
        od = pd.read_csv(a.ood)
        print(f"Embedding {len(od)} clips from other speakers...")
        Eo, _ = run(model, od["filepath"].tolist())
        d_o = mahalanobis_min(Eo, cents, precision)
        report["unknown_voice"]["other_speakers_flagged"] = float((d_o > thr).mean())
        report["unknown_voice"]["other_speakers_n"] = int(len(od))

    # ---- optional: gender / age temperature on Common Voice ----
    temps = {"dialect": t_d, "gender": 1.0, "age": 1.0}
    if a.cv_val:
        cv = pd.read_csv(a.cv_val)
        print(f"Embedding {len(cv)} Common Voice validation clips...")
        _, Lc = run(model, cv["filepath"].tolist())
        for task in ("gender", "age"):
            temps[task] = fit_temperature(Lc[task], cv[task].values)
    if a.cv_test:
        ct = pd.read_csv(a.cv_test)
        print(f"Embedding {len(ct)} Common Voice test clips...")
        Et, Lt = run(model, ct["filepath"].tolist())
        for task in ("gender", "age"):
            yy = ct[task].values; pp = softmax(Lt[task], temps[task])
            report[task] = {"temperature": temps[task], "test_accuracy": float(accuracy_score(yy, pp.argmax(1))),
                            "test_macro_f1": float(f1_score(yy, pp.argmax(1), average="macro")),
                            "test_balanced_accuracy": float(balanced_accuracy_score(yy, pp.argmax(1))),
                            "test_ece_after": ece(pp, yy)}
        d_cv = mahalanobis_min(Et, cents, precision)
        report["unknown_voice"]["common_voice_test_flagged"] = float((d_cv > thr).mean())

    os.makedirs(a.out, exist_ok=True)
    np.savez(os.path.join(a.out, "voice_reference.npz"), centroids=cents.astype(np.float32),
             precision=precision.astype(np.float32), voices=np.array(voices))
    cal = {"temperature": temps,
           "min_confidence": {"dialect": 0.60, "gender": 0.65, "age": 0.60},
           "unknown_voice": {"threshold": thr, "percentile": a.percentile},
           "calibrated_on": ("dialect on the RBVD validation split" + (", gender and age on Common Voice validation"
                                                                       if a.cv_val else "; gender and age not calibrated")),
           "report": report}
    with open(os.path.join(a.out, "calibration.json"), "w", encoding="utf-8") as f:
        json.dump(cal, f, indent=2)
    print(json.dumps(report, indent=2))
    print(f"\nWrote {a.out}/calibration.json and {a.out}/voice_reference.npz")


if __name__ == "__main__":
    main()

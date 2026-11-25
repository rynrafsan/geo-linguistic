"""Builds app/static/data/research.json, the numbers behind the Results, Data, Model and Literature pages.

Every number comes from a result file written by a training or test notebook (folder research_sources/) or from
tools/sample_scores.csv (the deployed app scored on the 161 RBVD test clips by tools/pick_samples.py). Nothing is
typed in by hand except descriptions, dataset facts, research_sources/literature.json (the literature review, gap
analysis and the v3.1 branch ablation) and research_sources/early_versions.json (v1, v2 and V3, from their notebooks).

Usage (from the geo_webapp folder):
    python tools/build_research.py
C3: research_sources/c3_run/ holds c3_results.json and c3_predictions.csv from the C3 confirmation notebook.
"""
import csv
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "research_sources")
OUT = os.path.join(ROOT, "app", "static", "data", "research.json")

DISTRICTS = ["Chottogram", "Barishal", "Rangpur", "Noakhali", "Mymensingh", "Tangail", "Jamalpur", "Natore"]
EN = {"Chottogram": "Chattogram"}


def load(name, required=True):
    p = os.path.join(SRC, name)
    if not os.path.exists(p):
        if required:
            raise FileNotFoundError(f"{p} is missing")
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f) if name.endswith(".json") else list(csv.DictReader(f))


def r(x, n=6):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(float(x), n)


def main():
    v4, v41, leak, d2 = load("v4_results.json"), load("v41_results.json"), load("leak_results.json"), load("d2_results.json")
    leak_groups = load("leak_groups.csv")
    early = load("early_versions.json")
    lit = load("literature.json")
    c3 = load("c3_results.json", required=False) or load("c3_run/c3_results.json", required=False)
    c3_pred = load("c3_run/c3_predictions.csv", required=False) or load("c3_predictions.csv", required=False)
    scores = list(csv.DictReader(open(os.path.join(ROOT, "tools", "sample_scores.csv"), encoding="utf-8")))

    cmp41 = v41["comparison"]
    v31, a41 = cmp41["v3.1"], cmp41["V4.1-A"]
    d2c = d2["comparison"]

    # ---------------------------------------------------------------- headline numbers (Home page)
    headline = [
        {"value": r(a41["RegSpeech12 test accuracy (new speakers)"]), "format": "percent",
         "label": "of clips from speakers the model never heard got the right district",
         "detail": "GEO V4.1-A, RegSpeech12 test: 806 clips, 24 voice groups, 5 districts"},
        {"value": r(a41["RBVD test macro-F1 (known voices)"]), "format": "decimal",
         "label": "macro-F1 on unseen sentences from the nine RBVD voices",
         "detail": "GEO V4.1-A, RBVD test split: 161 clips, 8 districts"},
        {"value": r(v31["CV gender accuracy"]), "format": "percent",
         "label": "gender accuracy on 109 Common Voice speakers held out from training",
         "detail": "GEO v3.1, 489 clips; 96.1% on BanglaAccent, another corpus"},
        {"value": r(v31["CV age balanced accuracy"]), "format": "decimal",
         "label": "balanced accuracy for age group (under 30 or 30+), the hardest output",
         "detail": "GEO v3.1, same 109 speakers; chance is 0.50"},
    ]

    # ---------------------------------------------------------------- versions (Results timeline)
    versions = [
        {"name": "GEO v3.1", "question": "Can one network learn dialect from RBVD and gender and age from Common Voice?",
         "data": "RBVD (9 voices, 8 districts) for dialect; balanced Common Voice Bangla for gender and age",
         "result": f"Known voices: macro-F1 {v31['RBVD test macro-F1 (known voices)']:.3f}. New speakers: "
                   f"{v31['RegSpeech12 test accuracy (new speakers)']:.1%} on RegSpeech12, close to chance (12.5%). "
                   f"Gender {v31['CV gender accuracy']:.1%}, age {v31['CV age balanced accuracy']:.3f}.",
         "decision": "Baseline for dialect: it recognises the nine RBVD voices rather than the dialects. Its gender and age "
                     "answers are the ones the app uses.", "status": "adopted"},
        {"name": "GEO V4", "question": "Does adding RegSpeech12 (many speakers, 5 districts) teach the dialects themselves?",
         "data": "RBVD + RegSpeech12 for dialect; every labelled Common Voice clip for gender and age",
         "result": f"New speakers: {v4['comparison']['V4-A']['RegSpeech12 test accuracy (new speakers)']:.1%}. "
                   f"Gender {v4['comparison']['V4-A']['CV gender accuracy']:.1%}, "
                   f"age {v4['comparison']['V4-A']['CV age balanced accuracy']:.3f} (the unbalanced pool pushed age down).",
         "decision": "Not adopted: gender and age dropped.", "status": "rejected"},
        {"name": "GEO V4.1", "question": "Can the dialect gain be kept without losing gender and age?",
         "data": "V4 + v3.1's balanced Common Voice split, RegSpeech12 split by voice group, two starting points",
         "result": f"New speakers: {a41['RegSpeech12 test accuracy (new speakers)']:.1%} "
                   f"(+{100 * v41['bootstrap_vs_v31']['RegSpeech12 accuracy (new speakers)']['difference']:.1f} points over v3.1, "
                   f"95% range +{100 * v41['bootstrap_vs_v31']['RegSpeech12 accuracy (new speakers)']['ci_low']:.1f} to "
                   f"+{100 * v41['bootstrap_vs_v31']['RegSpeech12 accuracy (new speakers)']['ci_high']:.1f}). "
                   f"BanglaAccent gender −3.6 points, age −4.1 points, both inside their 95% ranges.",
         "decision": "The pre-set rule said keep v3.1. After seeing the results the team combined the two: "
                     "V4.1-A answers dialect, v3.1 answers gender and age.", "status": "adopted"},
        {"name": "Leakage check", "question": "Is the 73% explained by the same people appearing in training and test?",
         "data": "ECAPA voice fingerprints of every RegSpeech12 voice group",
         "result": f"Closest test-to-training similarity {max(float(g['similarity']) for g in leak_groups):.2f}; "
                   f"the same voice scores {leak['same_voice']['p05']:.2f} or more in 95% of cases. "
                   f"Without the 6 most similar groups: {leak['accuracy']['without groups flagged at the 99th pct']['V4.1-A accuracy']:.1%}.",
         "decision": "No repeated speakers found. Accuracy varies a lot between voices (0–100% per group).", "status": "check"},
        {"name": "D2", "question": "Do more adult voices (new Bangla speakers, other languages) improve age?",
         "data": "Common Voice Bangla pools v3.1 never used, plus 10 other languages for training only",
         "result": f"Gender up about 2–3 points (C3: {d2c['C3_multi']['CV test: gender accuracy']:.1%} on the CV test). "
                   f"Age did not improve ({d2c['C3_multi']['Extended test: age balanced accuracy']:.3f} vs "
                   f"{d2c['v3.1']['Extended test: age balanced accuracy']:.3f} on the extended test).",
         "decision": "The pre-set rule said keep v3.1. The team chose to confirm C3 on fresh voices (BanglaAccent).",
         "status": "rejected"},
    ]
    shorts = [f"{v31['RegSpeech12 test accuracy (new speakers)']:.0%} on new speakers; answers gender and age in the app",
              f"{v4['comparison']['V4-A']['RegSpeech12 test accuracy (new speakers)']:.0%} on new speakers; gender and age dropped",
              f"{a41['RegSpeech12 test accuracy (new speakers)']:.0%} on new speakers; answers dialect in the app",
              "No repeated speakers found between training and test",
              "Gender up 2 to 3 points; age unchanged"]
    for v, sh in zip(versions, shorts):
        v["short"] = sh
    versions[0]["data"] += ". " + early["v31_extra_data"]
    versions[0]["result"] += " " + early["v31_extra_result"]
    where = [("Kaggle (T4 x2)", "Geo_Linguistic_Dialect_Demographics_V3.1_Kaggle.ipynb"),
             ("Kaggle", "Geo_Linguistic_V4_merge_Kaggle.ipynb"),
             ("Kaggle", "Geo_Linguistic_V4.1_merge_Kaggle.ipynb"),
             ("Kaggle", "Geo_Linguistic_V4.1_leakage_check_Kaggle.ipynb"),
             ("Kaggle", "Geo_Linguistic_D2_more_adult_voices_Kaggle.ipynb")]
    for v, (plat, nb) in zip(versions, where):
        v["platform"], v["notebook"] = plat, nb
    if c3:
        cc, vd = c3["comparison"], c3["verdict"]
        b = c3["bootstrap"]
        pts = lambda k: 100 * b[k]["difference"]
        summary = (f"Gender, Common Voice test: {cc['C3']['CV test: gender accuracy']:.1%} against "
                   f"{cc['v3.1']['CV test: gender accuracy']:.1%} for v3.1 (the D2 gain repeated). Gender on BanglaAccent, "
                   f"voices never used in training: {cc['C3']['BanglaAccent: gender accuracy']:.1%} against "
                   f"{cc['v3.1']['BanglaAccent: gender accuracy']:.1%}. Age, Common Voice test: "
                   f"{cc['C3']['CV test: age balanced accuracy']:.3f} against {cc['v3.1']['CV test: age balanced accuracy']:.3f}.")
        adopted = vd["use"].get("gender") != "v3.1" or vd["use"].get("age") != "v3.1"
        decision = (f"The rule written before the run kept v3.1 for gender and age: BanglaAccent gender fell "
                    f"{-pts('C3 minus v3.1 | BanglaAccent | gender accuracy'):.1f} points (1 allowed) and age fell "
                    f"{-pts('C3 minus v3.1 | CV test | age balanced accuracy'):.1f} points on the Common Voice test (2 allowed)."
                    if not adopted else vd["answer"])
        versions.append({"name": "C3 confirmation", "question": "Does C3's gender gain hold on voices it has never seen?",
                         "platform": "Kaggle", "notebook": "Geo_Linguistic_C3_confirm_Kaggle.ipynb",
                         "data": "C3 retrained from D2's clips; BanglaAccent gender (24 speakers) as a fresh test",
                         "result": summary, "decision": decision, "status": "adopted" if adopted else "rejected",
                         "short": "Gender gain did not hold on fresh voices; v3.1 kept" if not adopted else vd["answer"]})
    else:
        versions.append({"name": "C3 confirmation", "question": "Does C3's gender gain hold on voices it has never seen?",
                         "data": "C3 retrained; BanglaAccent gender as a fresh test",
                         "result": "Waiting for the Kaggle run.", "decision": "Pending.", "status": "pending",
                         "short": "C3 tested on fresh voices: pending"})

    versions = early["versions"] + versions

    # ---------------------------------------------------------------- dialect
    tests = [
        ("RBVD known voices, macro-F1", "RBVD test macro-F1 (known voices)", "decimal"),
        ("RegSpeech12 new speakers, accuracy", "RegSpeech12 test accuracy (new speakers)", "percent"),
        ("RegSpeech12 new speakers, per voice group", "RegSpeech12 group-balanced accuracy", "percent"),
        ("BanglaAccent read speech, accuracy", "BanglaAccent dialect accuracy", "percent"),
    ]
    v4a = v4["comparison"]["V4-A"]
    dialect_table = {"columns": ["v3.1", "V4-A", "V4.1-A"], "rows": []}
    for label, key, fmt in tests:
        v4key = key if key in v4a else ("RegSpeech12 per-speaker accuracy" if "group" in key else key)
        dialect_table["rows"].append({"test": label, "format": fmt, "values": [
            r(v31.get(key)), r(v4a.get(v4key)) if v4key in v4a else None, r(a41.get(key))]})
    dialect_table["note"] = ("V4's RegSpeech12 split differed from V4.1's, so its RegSpeech12 numbers are not directly "
                             "comparable; v3.1 was scored on both splits.")

    rs_split = v41["regspeech"]["split_segments"]
    per_district_new = [{"district": d, "en": EN.get(d, d),
                         "v3.1": r(v41["regspeech_recall_per_district"]["v3.1"][d]),
                         "V4.1-A": r(v41["regspeech_recall_per_district"]["V4.1-A"][d]),
                         "test_clips": rs_split["test"][d], "train_clips": rs_split["train"][d]}
                        for d in ["Rangpur", "Chottogram", "Barishal", "Tangail", "Noakhali"]]

    known = []
    for d in DISTRICTS:
        rows = [s for s in scores if (s["folder"].split("_")[0] if s["folder"].startswith("Rangpur") else s["folder"]) == d]
        right = sum(s["right_district"] == "True" for s in rows)
        conf = sum(s["status"] == "confident" for s in rows)
        known.append({"district": d, "en": EN.get(d, d), "clips": len(rows), "accuracy": r(right / len(rows)),
                      "flagged_unknown": r(sum(s["status"] == "unknown_voice" for s in rows) / len(rows)),
                      "confident": r(conf / len(rows))})
    confusion = {"labels": DISTRICTS, "matrix": [[0] * 8 for _ in DISTRICTS]}
    for s in scores:
        t = "Rangpur" if s["folder"].startswith("Rangpur") else s["folder"]
        confusion["matrix"][DISTRICTS.index(t)][DISTRICTS.index(s["district"])] += 1

    leakage = {
        "groups": [{"group": g["group"].split("|")[1], "district": g["district"], "segments": int(float(g["segments"])),
                    "similarity": r(g["similarity"], 3), "accuracy": r(g["V4.1-A correct"], 3)} for g in leak_groups],
        "same_voice_p05": r(leak["same_voice"]["p05"], 3), "same_voice_median": r(leak["same_voice"]["median"], 3),
        "different_people_p99": r(leak["different_people"]["p99"], 3),
        "different_people_median": r(leak["different_people"]["median"], 3),
        "train_to_train_median": r(leak["train_to_train_same_district"]["median"], 3),
        "accuracy": {k: {"clips": int(v["segments"]), "groups": int(v["groups"]), "v3.1": r(v["v3.1 accuracy"]),
                         "V4.1-A": r(v["V4.1-A accuracy"])} for k, v in leak["accuracy"].items()},
    }

    # ---------------------------------------------------------------- gender and age
    models = [("v3.1", "GEO v3.1", "in the app"), ("V4.1-A", "GEO V4.1-A", "app dialect model"),
              ("C0_cv", "C0 Common Voice, new recipe", ""), ("C1_cv_l4", "C1 + layer4 fine-tuned", ""),
              ("C2_pool", "C2 + new Bangla speakers", ""), ("C3_multi", "C3 + other languages", "chosen for confirmation")]
    sets = d2["sets"]
    demog_tests = [("CV test", f"Common Voice test: {sets['CV test']['clips']} clips, {sets['CV test']['speakers']} speakers"),
                   ("Extended test", f"Extended test: {sets['Extended test']['clips']} clips, {sets['Extended test']['speakers']} speakers"),
                   ("New-speaker test", f"New speakers only: {sets['New-speaker test']['clips']} clips, {sets['New-speaker test']['speakers']} speakers")]
    demography = {"models": [{"key": k, "name": n, "note": note} for k, n, note in models],
                  "tests": [{"key": k, "label": lab, "adult_speakers": sets[k]["adult_speakers"]} for k, lab in demog_tests],
                  "values": {k: {t: {"gender": r(d2c[k][f"{t}: gender accuracy"]),
                                     "age": r(d2c[k][f"{t}: age balanced accuracy"]),
                                     "adult_share": r(d2c[k][f"{t}: predicted Adult share"]),
                                     "true_adult_share": r(d2c[k][f"{t}: true Adult share"])}
                                 for t, _ in demog_tests} for k, _, _ in models},
                  "banglaaccent_gender": {"v3.1": r(v31["BanglaAccent gender accuracy"]),
                                          "V4.1-A": r(a41["BanglaAccent gender accuracy"])},
                  "bootstrap": [], "coverage": {}, "verdict": d2["verdict"]}
    for key, label in [("C0_cv minus v3.1 | CV test | gender accuracy", "C0 − v3.1, gender, CV test"),
                       ("C0_cv minus v3.1 | Extended test | gender accuracy", "C0 − v3.1, gender, extended test"),
                       ("C0_cv minus v3.1 | Extended test | age balanced accuracy", "C0 − v3.1, age, extended test"),
                       ("C1_cv_l4 minus C0_cv | Extended test | age balanced accuracy", "layer4 fine-tuning, age"),
                       ("C2_pool minus C1_cv_l4 | Extended test | age balanced accuracy", "new Bangla speakers, age"),
                       ("C3_multi minus C2_pool | Extended test | age balanced accuracy", "other languages, age")]:
        b = d2["bootstrap"][key]
        demography["bootstrap"].append({"label": label, "difference": r(b["difference"]), "low": r(b["ci_low"]),
                                        "high": r(b["ci_high"]), "speakers": b["speakers"]})
    for k, rows in d2["coverage"].items():
        demography["coverage"][k] = [{"threshold": row["threshold"], "answered": r(row["answered"]),
                                      "balanced": r(row["age balanced accuracy"])} for row in rows]
    if c3:
        cc = c3["comparison"]
        conf = {"verdict": c3["verdict"],
                "values": {m: {k: r(v) for k, v in cc[m].items()} for m in cc},
                "bootstrap": [], "groups": []}
        for key, label in [("C3 minus v3.1 | CV test | gender accuracy", "Gender, Common Voice test"),
                           ("C3 minus v3.1 | Extended test | gender accuracy", "Gender, extended test"),
                           ("C3 minus v3.1 | BanglaAccent | gender accuracy", "Gender, BanglaAccent (fresh voices)"),
                           ("C3 minus v3.1 | CV test | age balanced accuracy", "Age, Common Voice test"),
                           ("C3 minus v3.1 | Extended test | age balanced accuracy", "Age, extended test")]:
            bb = c3["bootstrap"][key]
            conf["bootstrap"].append({"label": label, "difference": r(bb["difference"]), "low": r(bb["ci_low"]),
                                      "high": r(bb["ci_high"]), "speakers": bb["speakers"]})
        if c3_pred:
            def gacc(rows):
                return r(sum((float(x["p_female"]) >= 0.5) == (x["true_gender"] == "1") for x in rows) / len(rows)) if rows else None
            for test, tlabel in [("CV test", "Common Voice test"), ("Extended test", "Extended test"), ("BanglaAccent", "BanglaAccent")]:
                for g, glabel in [("1", "Women"), ("0", "Men")]:
                    vals, n = [], 0
                    for m in ["v3.1", "C3"]:
                        rows = [x for x in c3_pred if x["set"] == test and x["model"] == m and x["true_gender"] == g]
                        vals.append(gacc(rows)); n = len(rows)
                    conf["groups"].append({"label": f"{glabel}, {tlabel}", "clips": n, "values": vals})
        demography["c3_confirmation"] = conf

    # ---------------------------------------------------------------- data
    cv = d2["common_voice"]["table"]
    census = [{"language": c["language"], "pool": c["pool"], "clips": int(c["labelled clips"]),
               "adult_f": int(c["speakers Adult-F"]), "adult_m": int(c["speakers Adult-M"]),
               "young_f": int(c["speakers Young-F"]), "young_m": int(c["speakers Young-M"]),
               "new_adult_f": int(c.get("NEW Adult-F", 0))} for c in d2["census"] if int(c["labelled clips"]) > 0]
    rs_groups = v41["regspeech"]["groups_per_region"]
    datasets = [
        {"name": "RBVD: Regional Bangla Voice Dataset", "role": "Dialect: training and test",
         "size": "1,067 clips, 9 speakers, 8 districts (one speaker each; two for Rangpur)",
         "split": "By sentence: 744 train, 162 validation, 161 test clips",
         "labels": "District from the folder name. Gender and age are not taken from RBVD.",
         "licence": "CC BY 4.0", "source": "Mendeley Data, 10.17632/cwz5fgxznr.1 (Rahman, Rahman and Rana)"},
        {"name": "RegSpeech12", "role": "Dialect: training and test (5 districts)",
         "size": f"{v41['regspeech']['segments']:,} segments in {sum(rs_groups.values())} voice groups: "
                 + ", ".join(f"{EN.get(k, k)} {v}" for k, v in rs_groups.items()),
         "split": "By voice group (ECAPA clustering), about 70 / 15 / 15 of each district's segments",
         "labels": "Region from the corpus (spontaneous speech, 12 regions; 5 overlap with RBVD)",
         "licence": "Released by its authors for public use",
         "source": "Hassan et al., 2025, arXiv:2510.24096"},
        {"name": "Mozilla Common Voice 17.0, Bangla", "role": "Gender and age: training and test",
         "size": f"{sum(cv['clips'].values()):,} clips from {sum(cv['speakers'].values())} speakers "
                 f"(balanced by gender and age group)",
         "split": f"By speaker: {cv['clips']['train']:,} / {cv['clips']['val']} / {cv['clips']['test']} clips; "
                  f"{cv['speakers']['train']} / {cv['speakers']['val']} / {cv['speakers']['test']} speakers",
         "labels": "Self-reported gender and age band; under 30 = Young, 30+ = Adult",
         "licence": "CC0", "source": "fixie-ai/common_voice_17_0 (Hugging Face mirror)"},
        {"name": "Common Voice 17.0, other pools and languages (D2)", "role": "Gender and age: extra training data",
         "size": "5,322 Bangla clips (979 training speakers in total); 10,041 clips from 4,052 speakers of other languages",
         "split": "New Bangla speakers split by speaker; other-language speakers used for training only",
         "labels": "As above", "licence": "CC0", "source": "fixie-ai/common_voice_17_0"},
        {"name": "Bangla Regional Accent Speech Corpus (BanglaAccent)", "role": "Test only: dialect and gender",
         "size": "75 dialect clips from 5 speakers in RBVD districts; 360 gender clips from 24 speakers",
         "split": "Never used for training", "labels": "Place, gender and age from the corpus metadata",
         "licence": "Data usage agreement: non-commercial research, no redistribution of audio",
         "source": "Daffodil International University, 10.17632/phk8yrfrc4.4",
         "attribution": "This research utilized the Bangla Regional Accent Speech Corpus, developed by Daffodil "
                        "International University: 10.17632/phk8yrfrc4.4, representing regional Bangla speech "
                        "diversity across Bangladesh."},
    ]
    cv_cells = [{"cell": c, "train": cv[c]["train"], "val": cv[c]["val"], "test": cv[c]["test"]}
                for c in ["Young-M", "Young-F", "Adult-M", "Adult-F"]]

    # ---------------------------------------------------------------- model
    hist = [{"epoch": h["epoch"], "new_speakers": r(h["regspeech_val"]), "known_voices": r(h["rbvd_val"])}
            for h in v41["stage2_history"]["A_fresh"]]

    # ---------------------------------------------------------------- literature
    ours = {"authors": "This project (GEO V4.1-A for dialect, v3.1 for gender and age)", "year": 2026, "theme": "ours",
            "title": "Geo-Linguistic Audio Analysis: Automated Identification of Native Dialects and Speaker Attributes for Inclusive Services",
            "venue": "FYDP, Daffodil International University",
            "method": "ResNet-50 on log-mel + 2-layer Bi-LSTM on MFCC, fused; RBVD + RegSpeech12 for dialect, Common Voice Bangla for gender and age",
            "findings": f"Dialect {a41['RegSpeech12 test accuracy (new speakers)']:.1%} on new speakers (macro-F1 "
                        f"{a41['RBVD test macro-F1 (known voices)']:.3f} on known voices); gender {v31['CV gender accuracy']:.1%}; "
                        f"age balanced accuracy {v31['CV age balanced accuracy']:.2f}",
            "speakers": "Yes: held-out RegSpeech12 voices, unseen Common Voice speakers, BanglaAccent"}
    comp = lit["comparison"]
    comp["reported"][-1] = (f"Dialect {a41['RegSpeech12 test accuracy (new speakers)']:.1%} on new speakers; "
                            f"gender {v31['CV gender accuracy']:.1%}; age {v31['CV age balanced accuracy']:.2f} balanced")
    literature = {"themes": lit["themes"], "studies": [ours] + lit["studies"], "gaps": lit["gaps"],
                  "comparison": comp, "source": lit["source"]}

    res = {"title": "Geo-Linguistic Audio Analysis: Automated Identification of Native Dialects and Speaker Attributes for Inclusive Services",
           "generated_from": sorted(f for f in os.listdir(SRC) if not f.startswith(".") and os.path.isfile(os.path.join(SRC, f)))
                             + (["c3_run/c3_results.json", "c3_run/c3_predictions.csv"] if c3 else []) + ["tools/sample_scores.csv"],
           "headline": headline, "versions": versions,
           "dialect": {"table": dialect_table, "new_speakers_by_district": per_district_new,
                       "known_voices_by_district": known, "known_confusion": confusion,
                       "known_overall": {"clips": len(scores), "accuracy": r(sum(s["right_district"] == "True" for s in scores) / len(scores)),
                                         "flagged_unknown": r(sum(s["status"] == "unknown_voice" for s in scores) / len(scores))},
                       "rbvd_only_share": {"v3.1": r(v31["RegSpeech12 clips sent to RBVD-only districts"]),
                                           "V4.1-A": r(a41["RegSpeech12 clips sent to RBVD-only districts"])},
                       "leakage": leakage},
           "demography": demography,
           "data": {"datasets": datasets, "common_voice_cells": cv_cells, "census": census,
                    "d2_sets": sets},
           "model": {"parameters_m": 24.46, "history_v41": hist, "ablation": lit["ablation"],
                     "unknown_voice": {"threshold": r(v41["export"]["unknown_voice_threshold"], 2),
                                       "flagged": {k: r(v) for k, v in v41["export"]["unknown_voice_flagged"].items()}},
                     "temperature_dialect": r(v41["export"]["temperature"]["dialect"], 2)},
           "literature": literature,
           "c3_available": bool(c3)}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB); C3 results {'included' if c3 else 'not yet available'}")


if __name__ == "__main__":
    main()

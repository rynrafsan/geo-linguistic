"""Choose the sample clips offered on the Analyze page.

Only RBVD test-split clips are considered (the dialect model never trained on them). For each speaker folder the clip
kept is the one the deployed models answer best:
  - the district answer is right, confident, and the voice check says "known voice";
  - the gender answer is confident by the app's own rule; for the two Rangpur speakers, whose folder names say which
    is the man and which is the woman, it must also match;
  - the clip is 2 to 8 seconds long.
Among those, the clip with the highest district confidence x gender confidence wins, one clip per district (for
Rangpur, the better of its two speakers). Age is not used: RBVD has no age labels and none are taken from it.
Rerun this after the gender/age model changes (C3): which clips qualify depends on the models.

Usage (from the geo_webapp folder):
    python tools/pick_samples.py --rbvd "<folder with the RBVD district folders>" [--split rbvd_split.csv] [--copy]
--copy replaces samples/*.mp3 with the chosen clips and writes samples/samples.json for the page.
"""
import argparse, json, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pandas as pd  # noqa: E402
from app.predictor import Predictor  # noqa: E402

FOLDER_DISTRICT = {"Rangpur_Female": "Rangpur", "Rangpur_Male": "Rangpur"}
FOLDER_GENDER = {"Rangpur_Female": "Female", "Rangpur_Male": "Male"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rbvd", required=True)
    ap.add_argument("--split", default="rbvd_split.csv")
    ap.add_argument("--model", default="model")
    ap.add_argument("--copy", action="store_true")
    ap.add_argument("--reuse", action="store_true", help="reuse tools/sample_scores.csv instead of scoring again")
    a = ap.parse_args()
    split = pd.read_csv(a.split)
    test = split[split["split"] == "test"]
    pred = Predictor(a.model)
    g_min = pred.calibration["min_confidence"]["gender"]
    rows = []
    if a.reuse:
        test = test.iloc[0:0]
        rows = pd.read_csv("tools/sample_scores.csv").to_dict("records")
    for r in test.itertuples():
        fp = os.path.join(a.rbvd, r.folder, r.filename)
        if not os.path.exists(fp):
            continue
        try:
            o = pred.predict_file(fp)
        except Exception as e:
            print("skip", r.filename, e); continue
        true_d = FOLDER_DISTRICT.get(r.folder, r.folder)
        rows.append({"folder": r.folder, "file": r.filename, "path": fp, "seconds": o["audio"]["seconds"],
                     "district": o["dialect"]["prediction"], "district_conf": o["dialect"]["confidence"], "status": o["dialect"]["status"],
                     "gender": o["gender"]["prediction"], "gender_conf": o["gender"]["confidence"],
                     "age": o["age"]["prediction"], "age_conf": o["age"]["confidence"],
                     "right_district": o["dialect"]["prediction"] == true_d})
    df = pd.DataFrame(rows)
    df.to_csv("tools/sample_scores.csv", index=False)
    print(f"Scored {len(df)} RBVD test clips. District right: {df['right_district'].mean():.1%}; "
          f"confident and known voice: {(df['status'] == 'confident').mean():.1%}")
    ok = df[df["right_district"] & (df["status"] == "confident") & (df["gender_conf"] >= g_min) & df["seconds"].between(2, 8)].copy()
    ok = ok[ok.apply(lambda r: FOLDER_GENDER.get(r["folder"], r["gender"]) == r["gender"], axis=1)]
    ok["district_name"] = ok["folder"].map(lambda f: FOLDER_DISTRICT.get(f, f))
    ok["score"] = ok["district_conf"] * ok["gender_conf"]
    chosen = ok.sort_values("score", ascending=False).groupby("district_name").head(1).sort_values("district_name")
    print(chosen[["folder", "file", "seconds", "district", "district_conf", "gender", "gender_conf", "age", "age_conf"]].to_string(index=False))
    chosen = chosen.reset_index(drop=True)
    missing = sorted(set(df["folder"]) - set(chosen["folder"]))
    if missing:
        print("Speakers with no clip in the list:", missing)
        for f in missing:
            d = df[df["folder"] == f]
            g = FOLDER_GENDER.get(f)
            if g:
                print(f"  {f}: gender heard as {g} in {(d['gender'] == g).sum()} of {len(d)} clips")
    if a.copy:
        for f in os.listdir("samples"):
            if f.endswith(".mp3"):
                os.remove(os.path.join("samples", f))
        meta = []
        for r in chosen.itertuples():
            name = f"{r.folder}_{os.path.splitext(r.file)[0].replace('(', '_').replace(')', '')}.mp3"
            shutil.copy(r.path, os.path.join("samples", name))
            meta.append({"file": name, "district": r.district_name, "speaker": r.folder,
                         "source": f"RBVD test split, {r.file}", "seconds": round(r.seconds, 1)})
        json.dump(meta, open("samples/samples.json", "w"), indent=2)
        print(f"Copied {len(meta)} clips to samples/ and wrote samples/samples.json")


if __name__ == "__main__":
    main()

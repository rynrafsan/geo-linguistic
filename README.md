---
title: Geo-Linguistic Audio Analysis
emoji: 🎙️
colorFrom: green
colorTo: yellow
sdk: gradio
sdk_version: 6.32.0
app_file: app.py
python_version: "3.12"
short_description: Bangla dialect, gender and age from a voice clip
pinned: false
---

# Geo-Linguistic Audio Analysis: web service

Final Year Design Project, Department of CSE, Daffodil International University.
Raiyan Jahan and Md. Ibna Labid. Supervisor: Mushfiqur Rahman.

Record or upload a short Bangla voice clip. The Analyze page shows three predictions: dialect (one of eight RBVD districts) on a district map of Bangladesh, gender and age group. Each one comes with a calibrated confidence and an honest status. The site also has Results, Data, Model, Literature and About pages with the research behind the model (charts and tables built from the notebooks' result files).

- **Confident**: the calibrated confidence is above the threshold for that task.
- **Unsure**: the model's best guess is shown, but its confidence is low.
- **Unknown voice** (dialect only): the voice is far from the training data of all eight districts, so the dialect answer is not trustworthy.

## Folder layout

```
app/                 the web service
  main.py            page and API routes (FastAPI)
  predictor.py       windows the audio, runs the model, applies calibration and the unknown-voice check
  audio.py           decoding and features (identical to the training notebook)
  model.py           ResNet-50 + Bi-LSTM network (identical to the training notebook)
  static/            index.html, styles.css, app.js (page logic), charts.js (SVG charts), fonts/ (OFL)
  static/data/       bd_map.json (district map), research.json (numbers for the research pages)
app.py               entry point for the Hugging Face Space
model/               put the trained model here (see below)
samples/             one RBVD test-split clip per district (CC BY 4.0) and samples.json
research_sources/    result files from the notebooks (v4, v41, leakage check, d2; c3_run/ for the C3 confirmation),
                     early_versions.json (v1 and v2 on Colab, V3) and literature.json (literature review, gap analysis, v3.1 ablation)
tools/pick_samples.py    scores every RBVD test clip with the installed models and chooses the sample clips
tools/build_research.py  rebuilds static/data/research.json from research_sources/
tools/calibrate.py   rebuilds calibration.json and voice_reference.npz on your own computer
run_local.bat        start on Windows
run_local.sh         start on macOS / Linux
Dockerfile           for any Docker host (not needed for the free Hugging Face Space)
```

## 1. Put the trained models in place

The app uses two trained copies of the same network: **V4.1-A answers dialect**, **v3.1 answers gender and age**. `calibration.json` says which file does what.

| File in `model/` | What it is | Where it comes from |
|---|---|---|
| `model.pt` | GEO v3.1: gender and age | GEO v3.1 output → `FYDP_Project/checkpoints/v31_best_model.pt`, renamed |
| `dialect_model.pt` | GEO V4.1-A: dialect | V4.1 output → `FYDP_Project_V41/v41_best_model.pt`, renamed |
| `voice_reference.npz` | district reference points for the unknown-voice check (from V4.1-A) | V4.1 output → `FYDP_Project_V41/voice_reference.npz` |
| `calibration.json` | the combined settings and page text | already in `model/` |

Only `model.pt` is required. Without `dialect_model` in `calibration.json`, `model.pt` answers all three questions (the v3.1-only app). The v3.1-only settings are kept in `model/v31_only/` if you want to switch back: copy its two files over the ones in `model/`.

No Kaggle access? `tools/calibrate.py` can rebuild the **v3.1-only** dialect calibration and voice reference from the RBVD folder on your computer (about 2 minutes on a CPU). It overwrites the combined settings, so write to another folder with `--out`:

```
.venv\Scripts\python tools\calibrate.py --checkpoint model\model.pt --rbvd "path\to\RBVD Regional Bangla Voice Dataset" --out model
```

## 2. Run it on the laptop (Windows)

1. Install Python 3.11 or 3.12 from python.org and tick **Add python.exe to PATH**.
2. Double-click `run_local.bat`.
   - First run: creates `.venv` and installs the packages (about 10 minutes, needs internet).
   - Later runs: start in a few seconds and work offline.
3. The browser opens http://localhost:8000. Press Ctrl+C in the black window to stop.

macOS / Linux: `./run_local.sh`.

## 3. Put it online (free Hugging Face Space)

A free Hugging Face account cannot run Docker or CPU Spaces, but it can run up to two **ZeroGPU** Spaces. This app runs on ZeroGPU hardware and does its work on the CPU, so it uses no GPU quota. `app.py` declares the placeholder GPU function that ZeroGPU needs in order to start.

In a terminal inside this folder (on Windows, run `.venv\Scripts\activate` first):

```
pip install -U huggingface_hub
hf auth login
hf repos create <your-username>/geo-linguistic --type space --space-sdk gradio --flavor zero-a10g --env GRADIO_SSR_MODE=false --protected
hf upload <your-username>/geo-linguistic . --repo-type space --exclude ".venv/**" --exclude "**/__pycache__/**" --exclude "model_test/**"
```

- `--protected` makes the app reachable by anyone with the link while keeping the files (including the model weights) private. If your account refuses it, use `--public`.
- `GRADIO_SSR_MODE=false` is required: without it, Gradio's own page replaces ours at `/`. If you create the Space on the website instead, add it under **Settings → Variables**.
- The first build takes 5 to 10 minutes. The link is `https://<your-username>-geo-linguistic.hf.space`.
- After changing files, run the same `hf upload` command again.

Check that it works: `hf spaces logs <your-username>/geo-linguistic` should end with "Running on local URL" (add `--build` to see the build log if it fails). Then open the link and try a sample clip.

## API

| Method | Path | What it does |
|---|---|---|
| POST | `/api/predict` | multipart form field `audio` (WAV, MP3, M4A, OGG, OPUS, WEBM or FLAC; up to 15 MB and 60 s). Returns JSON with `dialect`, `gender` and `age`, each with `prediction`, `confidence`, `status` and `scores`, plus `windows` (each 5-second window's district scores), `voice_check` and audio details. |
| GET | `/api/info` | classes, calibration status and the sample list |
| GET | `/api/research` | the numbers behind the research pages |
| GET | `/api/health` | `{"status": "ok"}` |

Example: `curl -F "audio=@samples/Natore_Natore_43.mp3" http://localhost:8000/api/predict`

## Data and licences

- Dialect: RBVD: Regional Bangla Voice Dataset, Mushfiqur Rahman, Mendeley Data, 2025, [doi:10.17632/cwz5fgxznr.1](https://doi.org/10.17632/cwz5fgxznr.1), CC BY 4.0. The eight sample clips come from its test split.
- Gender and age: Mozilla Common Voice Bangla (CC0). No gender or age label was taken from RBVD.

- Dialect, new speakers: RegSpeech12 (Hassan et al., 2025, arXiv:2510.24096).
- Test only: Bangla Regional Accent Speech Corpus. "This research utilized the Bangla Regional Accent Speech Corpus, developed by Daffodil International University: 10.17632/phk8yrfrc4.4, representing regional Bangla speech diversity across Bangladesh." Its audio is not included here.
- Map: district boundaries from geoBoundaries gbOpen BGD (CC BY 4.0; BBS / OCHA ROAP), via the bangladesh-geojson package (ODbL). Every district polygon was checked to contain its own headquarters and no other.
- Fonts: Anek Bangla and Hind Siliguri (SIL Open Font License; licence files in `app/static/fonts/`).

## Updating after a new model (for example C3)

1. Copy the new gender/age checkpoint over `model/model.pt` (keep `"dialect_model": "dialect_model.pt"` in `model/calibration.json`).
2. Choose the sample clips again, because which clips the models answer well depends on the models:
   `python tools/pick_samples.py --rbvd "path\to\RBVD Regional Bangla Voice Dataset" --copy`
   It keeps, per district, the RBVD test clip whose district answer is right, confident and a known voice, whose gender answer is confident (and right for the two Rangpur speakers, the only RBVD folders with a stated gender), and that is 2 to 8 s long. RBVD gender and age labels are not used otherwise.
3. Copy the notebook's results file into `research_sources/` (C3's `c3_results.json` and `c3_predictions.csv` are in `research_sources/c3_run/`) and run `python tools/build_research.py`.

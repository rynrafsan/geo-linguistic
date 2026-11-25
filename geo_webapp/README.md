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

Record or upload a short Bangla voice clip. The page shows three predictions: dialect (one of eight RBVD districts), gender and age group. Each one comes with a calibrated confidence and an honest status:

- **Confident**: the calibrated confidence is above the threshold for that task.
- **Unsure**: the model's best guess is shown, but its confidence is low.
- **Unknown voice** (dialect only): the voice is unlike all nine RBVD speakers. A dialect answer for such a voice is not trustworthy, because every RBVD district was recorded by one person (see the report's Limitations chapter).

## Folder layout

```
app/                 the web service
  main.py            page and API routes (FastAPI)
  predictor.py       windows the audio, runs the model, applies calibration and the unknown-voice check
  audio.py           decoding and features (identical to the training notebook)
  model.py           ResNet-50 + Bi-LSTM network (identical to the training notebook)
  static/            index.html, styles.css, app.js
app.py               entry point for the Hugging Face Space
model/               put the trained model here (see below)
samples/             nine RBVD test-split clips for the sample menu (CC BY 4.0)
tools/calibrate.py   rebuilds calibration.json and voice_reference.npz on your own computer
run_local.bat        start on Windows
run_local.sh         start on macOS / Linux
Dockerfile           for any Docker host (not needed for the free Hugging Face Space)
```

## 1. Put the trained model in place

From the Kaggle notebooks' **Output** tabs, download:

| File | From | Rename to |
|---|---|---|
| `v31_best_model.pt` | GEO v3.1 → `FYDP_Project/checkpoints/` | `model/model.pt` |
| `calibration.json` | GEO v3.1 follow-up | `model/calibration.json` |
| `voice_reference.npz` | GEO v3.1 follow-up | `model/voice_reference.npz` |

Only `model.pt` is required. Without the other two files the service still runs, but confidences are not calibrated and the unknown-voice check is off (the page says so).

No Kaggle access? `tools/calibrate.py` can rebuild the dialect calibration and the voice reference from the RBVD folder on your computer (about 2 minutes on a CPU):

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
| POST | `/api/predict` | multipart form field `audio` (WAV, MP3, M4A, OGG, OPUS, WEBM or FLAC; up to 15 MB and 60 s). Returns JSON with `dialect`, `gender` and `age`, each with `prediction`, `confidence`, `status` and `scores`, plus `voice_check` and audio details. |
| GET | `/api/info` | classes, calibration status and the sample list |
| GET | `/api/health` | `{"status": "ok"}` |

Example: `curl -F "audio=@samples/Natore_sentence_5.mp3" http://localhost:8000/api/predict`

## Data and licences

- Dialect: RBVD: Regional Bangla Voice Dataset, Mushfiqur Rahman, Mendeley Data, 2025, [doi:10.17632/cwz5fgxznr.1](https://doi.org/10.17632/cwz5fgxznr.1), CC BY 4.0. The nine sample clips come from it.
- Gender and age: Mozilla Common Voice Bangla (CC0). No gender or age label was taken from RBVD.

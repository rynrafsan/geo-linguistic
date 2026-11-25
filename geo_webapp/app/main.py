"""FastAPI web service for the Geo-Linguistic model.

Run locally:   uvicorn app.main:app --port 8000      then open http://localhost:8000
Online:        app.py (repo root) registers the same routes on a Gradio Server for Hugging Face Spaces.
API:           POST /api/predict   (multipart form field "audio")
               GET  /api/info      model, classes and calibration status
               GET  /api/health
"""
import os
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .predictor import InputError, Predictor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.environ.get("GEO_MODEL_DIR", os.path.join(ROOT, "model"))
SAMPLES_DIR = os.path.join(ROOT, "samples")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ALLOWED = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".webm", ".flac"}

predictor = Predictor(MODEL_DIR)


def register_routes(app):
    """Adds the page, the static files and the API to a FastAPI app (or a Gradio Server, which is one)."""
    app.mount("/web", StaticFiles(directory=STATIC_DIR), name="web")
    if os.path.isdir(SAMPLES_DIR):
        app.mount("/samples", StaticFiles(directory=SAMPLES_DIR), name="samples")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/info")
    def info():
        data = predictor.info()
        data["samples"] = sorted(os.listdir(SAMPLES_DIR)) if os.path.isdir(SAMPLES_DIR) else []
        return data

    @app.post("/api/predict")
    async def predict(audio: UploadFile = File(...)):
        name = audio.filename or "recording.webm"
        suffix = os.path.splitext(name)[1].lower() or ".webm"
        if suffix not in ALLOWED:
            raise HTTPException(415, f"Files of type {suffix} are not supported. Use WAV, MP3, M4A, OGG or WEBM.")
        data = await audio.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "The file is larger than 15 MB. Upload a clip of one minute or less.")
        t0 = time.time()
        try:
            result = predictor.predict_bytes(data, suffix)
        except InputError as e:
            raise HTTPException(422, str(e))
        result["seconds_to_predict"] = round(time.time() - t0, 2)
        result["file"] = name
        return JSONResponse(result)

    return app


app = register_routes(FastAPI(title="Geo-Linguistic Audio Analysis", version="1.0"))

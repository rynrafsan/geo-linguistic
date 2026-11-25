#!/usr/bin/env bash
# Starts the Geo-Linguistic web service on macOS / Linux.
set -e
cd "$(dirname "$0")"
if [ ! -f model/model.pt ]; then
  echo "The trained model is missing: copy v31_best_model.pt to model/model.pt"; exit 1
fi
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
echo "Open http://localhost:8000"
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

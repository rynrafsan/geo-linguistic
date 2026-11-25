The app uses two trained copies of the same network:

  model.pt              = GEO v3.1 (v31_best_model.pt, renamed): answers gender and age
  dialect_model.pt      = GEO V4.1-A (v41_best_model.pt, renamed): answers dialect
  voice_reference.npz   = from the V4.1 output: district reference points for the unknown-voice check
  calibration.json      = combined settings; its "dialect_model" entry points at dialect_model.pt

Only model.pt is required. If calibration.json has no "dialect_model" entry, model.pt answers
all three questions (the v3.1-only app). The v3.1-only calibration.json and voice_reference.npz
are kept in the v31_only folder.

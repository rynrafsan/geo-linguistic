Put the trained model here:

  model.pt              = v31_best_model.pt from the GEO v3.1 Kaggle output (FYDP_Project/checkpoints), renamed
  calibration.json      = from the GEO v3.1 follow-up Kaggle output
  voice_reference.npz   = from the GEO v3.1 follow-up Kaggle output

Only model.pt is required. Without the other two, confidences are not calibrated
and the unknown-voice check is off.

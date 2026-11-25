"""Audio decoding and feature extraction.

Copied from the training notebook (Cell 5) so that the web service turns a clip into
exactly the same inputs the model was trained on:
  16 kHz mono -> 5.0 s window -> log-mel spectrogram (3 x 128 x 157) + MFCC (157 x 40).
"""
import shutil
import subprocess

import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F
import torchaudio.transforms as T

SAMPLE_RATE = 16000
CLIP_DURATION = 5.0
TARGET_LEN = int(SAMPLE_RATE * CLIP_DURATION)
N_MELS, N_MFCC, N_FFT, HOP_LENGTH = 128, 40, 2048, 512
MIN_VALID_SECONDS = 0.3

_mel_transform = T.MelSpectrogram(sample_rate=SAMPLE_RATE, n_fft=N_FFT, hop_length=HOP_LENGTH, n_mels=N_MELS)
_db_transform = T.AmplitudeToDB(stype="power")
_mfcc_transform = T.MFCC(sample_rate=SAMPLE_RATE, n_mfcc=N_MFCC,
                         melkwargs={"n_fft": N_FFT, "hop_length": HOP_LENGTH, "n_mels": N_MELS})


def _find_ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


FFMPEG_EXE = _find_ffmpeg()


def _decode_ffmpeg(path):
    if FFMPEG_EXE is None:
        raise RuntimeError("ffmpeg is not available; install the imageio-ffmpeg package.")
    raw = subprocess.run([FFMPEG_EXE, "-v", "quiet", "-i", path, "-f", "f32le", "-ac", "1",
                          "-ar", str(SAMPLE_RATE), "-"], capture_output=True, timeout=60).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def _resample(y, sr):
    """Same resampler the notebook used: librosa.resample's default is soxr 'HQ'.
    Calling soxr directly gives identical output without librosa's slow first import."""
    try:
        import soxr
        return soxr.resample(y, sr, SAMPLE_RATE, quality="HQ").astype(np.float32)
    except ImportError:
        import librosa
        return librosa.resample(y, orig_sr=sr, target_sr=SAMPLE_RATE)


def decode_audio(path):
    """Any audio file (wav, mp3, m4a/aac, ogg, browser webm) -> mono float32 at 16 kHz."""
    y = None
    try:
        y, sr = sf.read(path, dtype="float32", always_2d=True)
        y = y.mean(axis=1)
        if sr != SAMPLE_RATE:
            y = _resample(y, sr)
    except Exception:
        y = None
    if y is None or len(y) < MIN_VALID_SECONDS * SAMPLE_RATE:
        y = _decode_ffmpeg(path)
    return np.ascontiguousarray(y, dtype=np.float32)


def windows_of(y, hop_seconds=2.5):
    """Split a waveform into 5 s windows exactly as the notebook does for one clip.

    Clips up to 5 s: one window, zero-padded at the end (training behaviour).
    Longer clips: 5 s windows every `hop_seconds`; predictions are averaged over them.
    """
    if len(y) <= TARGET_LEN:
        return [F.pad(torch.from_numpy(y).unsqueeze(0), (0, TARGET_LEN - len(y)))]
    hop = int(hop_seconds * SAMPLE_RATE)
    starts = list(range(0, len(y) - TARGET_LEN + 1, hop))
    if starts[-1] != len(y) - TARGET_LEN:
        starts.append(len(y) - TARGET_LEN)
    return [torch.from_numpy(y[s:s + TARGET_LEN].copy()).unsqueeze(0) for s in starts]


def extract_features(wav):
    """wav: (1, TARGET_LEN) -> spectrogram (3, 128, 157), mfcc (157, 40). Same as training, no augmentation."""
    mel_db = _db_transform(_mel_transform(wav)).squeeze(0)
    mfcc = _mfcc_transform(wav).squeeze(0)
    mel_db = (mel_db - mel_db.mean()) / (mel_db.std() + 1e-6)
    return mel_db.unsqueeze(0).repeat(3, 1, 1), mfcc.transpose(0, 1)


def speech_level(y):
    """RMS in dBFS, used to reject silent recordings."""
    rms = float(np.sqrt(np.mean(np.square(y)) + 1e-12))
    return 20 * np.log10(rms + 1e-12)

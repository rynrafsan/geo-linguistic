"""The trained network: identical to the notebook (Cells 10-12), so the checkpoint loads as is.

ResNet-50 on the log-mel spectrogram (spectral branch) + 2-layer Bi-LSTM on the MFCC
sequence (temporal branch) -> concatenate -> Dense(128) + ReLU + BatchNorm + Dropout ->
three heads (dialect, gender, age).
"""
import torch
import torch.nn as nn
import torchvision.models as models

N_MFCC = 40


class SpectralBranch(nn.Module):
    def __init__(self, out_dim=128):
        super().__init__()
        backbone = models.resnet50(weights=None)       # weights come from the checkpoint
        backbone.fc = nn.Identity()
        self.backbone = backbone
        self.project = nn.Sequential(nn.Linear(2048, out_dim), nn.ReLU(inplace=True))

    def forward(self, x):
        return self.project(self.backbone(x))


class TemporalBranch(nn.Module):
    def __init__(self, input_dim=N_MFCC, hidden_dim=128, out_dim=128, num_layers=2, dropout=0.3):
        super().__init__()
        self.lstm = nn.LSTM(input_size=input_dim, hidden_size=hidden_dim, num_layers=num_layers,
                            batch_first=True, bidirectional=True, dropout=dropout if num_layers > 1 else 0.0)
        self.project = nn.Sequential(nn.Linear(hidden_dim * 2, out_dim), nn.ReLU(inplace=True), nn.Dropout(dropout))

    def forward(self, x):
        _, (h_n, _) = self.lstm(x)
        return self.project(torch.cat([h_n[-2], h_n[-1]], dim=1))


class GeoLinguisticMultiTaskNet(nn.Module):
    def __init__(self, n_dialect=8, n_gender=2, n_age=2, fusion_dropout=0.6):
        super().__init__()
        self.spectral = SpectralBranch()
        self.temporal = TemporalBranch()
        self.fusion = nn.Sequential(nn.Linear(256, 128), nn.ReLU(inplace=True),
                                    nn.BatchNorm1d(128), nn.Dropout(fusion_dropout))
        self.dialect_head = nn.Linear(128, n_dialect)
        self.gender_head = nn.Linear(128, n_gender)
        self.age_head = nn.Linear(128, n_age)

    def embed(self, x_spec, x_mfcc):
        """The shared 128-d embedding every head reads (used for the unknown-voice check)."""
        return self.fusion(torch.cat([self.spectral(x_spec), self.temporal(x_mfcc)], dim=1))

    def forward(self, x_spec, x_mfcc):
        h = self.embed(x_spec, x_mfcc)
        return self.dialect_head(h), self.gender_head(h), self.age_head(h)


def load_checkpoint(path):
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    sd = ckpt.get("model_state_dict", ckpt)
    model = GeoLinguisticMultiTaskNet(n_dialect=sd["dialect_head.weight"].shape[0],
                                      n_gender=sd["gender_head.weight"].shape[0],
                                      n_age=sd["age_head.weight"].shape[0])
    model.load_state_dict(sd)
    model.eval()
    return model, {k: v for k, v in ckpt.items() if k != "model_state_dict"} if isinstance(ckpt, dict) else {}

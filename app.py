"""Entry point for the free online version (Hugging Face Space, Gradio SDK on ZeroGPU hardware).

The same page and API as the laptop version (app/main.py) are registered on a Gradio Server.
The model runs on the CPU. ZeroGPU hardware needs at least one @spaces.GPU function to start,
so a placeholder is declared; it is never called, so no GPU time is used.
"""
import os

try:
    import spaces  # only present on Hugging Face; must be imported before torch

    @spaces.GPU(duration=1)
    def _zerogpu_placeholder():
        pass
except ImportError:
    pass

from gradio import Server

from app.main import register_routes

demo = register_routes(Server(title="Geo-Linguistic Audio Analysis"))

if __name__ == "__main__":
    demo.launch(ssr_mode=False, server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))

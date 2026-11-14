"""Vercel function: POST /api/isolate {crop, label} -> white-background isometric product shot."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402

handler = core.make_handler(core.isolate)

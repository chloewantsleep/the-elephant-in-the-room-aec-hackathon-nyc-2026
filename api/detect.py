"""Vercel function: POST /api/detect {photo} -> existing furniture with boxes, categories, est. sizes."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402

handler = core.make_handler(core.detect)

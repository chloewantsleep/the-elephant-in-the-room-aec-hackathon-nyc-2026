"""Vercel function: POST /api/render -> Gemini render (full or edit mode). GET -> health check."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402

class handler(core.make_handler(core.render)):  # Vercel detects functions by 'class handler'
    pass

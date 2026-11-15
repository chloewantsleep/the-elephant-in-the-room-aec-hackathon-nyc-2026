"""Vercel function: POST /api/cached_render -> a full render saved earlier (demo). GET -> health."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402

class handler(core.make_handler(core.cached_render)):  # Vercel detects functions by 'class handler'
    pass

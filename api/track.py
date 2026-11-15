"""Vercel function: POST /api/track -> where each new product is in a render. GET -> health."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402

class handler(core.make_handler(core.track)):  # Vercel detects functions by 'class handler'
    pass

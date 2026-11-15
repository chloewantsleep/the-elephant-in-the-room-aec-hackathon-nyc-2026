"""Vercel function: POST /api/swap -> one product crop with a similar product in its place. GET -> health."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402

class handler(core.make_handler(core.swap)):  # Vercel detects functions by 'class handler'
    pass

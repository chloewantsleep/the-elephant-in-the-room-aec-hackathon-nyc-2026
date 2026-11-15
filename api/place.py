"""Vercel function: POST /api/place -> add a sketched piece into a small crop around the sketch. GET -> health."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402

class handler(core.make_handler(core.place)):  # Vercel detects functions by 'class handler'
    pass

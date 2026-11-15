"""Vercel function: POST /api/sketch {image, marks, scene, ...} -> Claude's reading of the sketch as scene edits."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root, for sketch_ai.py
import _core as core  # noqa: E402
import sketch_ai  # noqa: E402


class handler(core.make_handler(sketch_ai.read_sketch)):  # Vercel detects functions by 'class handler'
    pass

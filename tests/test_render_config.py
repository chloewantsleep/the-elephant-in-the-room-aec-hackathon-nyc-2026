import os
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "api"))
import _core as core


class RenderConfigTests(unittest.TestCase):
    def test_each_edit_uses_its_own_model_and_cache_key(self):
        req = {"crop": "crop", "guide": "guide", "image": "product", "to_image": "replacement"}
        for name, setting in (("recolor", "RECOLOR_MODEL"), ("swap", "SWAP_MODEL"), ("place", "PLACE_MODEL")):
            with self.subTest(operation=name), patch.object(core, "KEY", "test"), \
                    patch.object(core, setting, "test-" + name), \
                    patch.object(core, "image_part", return_value={}), \
                    patch.object(core, "code_version", return_value="test"), \
                    patch.object(core, "_image_call", return_value="image") as generate, \
                    patch.object(core, "cached", side_effect=lambda kind, key, run, *args: (key, run())):
                key, result = getattr(core, name)(req)
                self.assertEqual(key["m"], "test-" + name)
                self.assertEqual(result["model"], "test-" + name)
                self.assertEqual(generate.call_args.args[0], "test-" + name)

    def test_public_settings_expose_only_switches_and_models(self):
        with patch.dict(os.environ, {"AI_RENDER_ENABLED": "false", "AI_RENDER_DEMO_CACHE_ONLY": "0",
                                     "GEMINI_API_KEY": "never-public"}):
            config = core.render_config()
        self.assertFalse(config["aiEnabled"])
        self.assertFalse(config["demoCacheOnly"])
        self.assertEqual(set(config), {"aiEnabled", "demoCacheOnly", "models"})
        self.assertEqual(set(config["models"]), {"render", "recolor", "swap", "place"})
        self.assertNotIn("never-public", str(config))

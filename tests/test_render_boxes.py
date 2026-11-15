import sys, pathlib, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'api'))
import _core as core


class RenderBoxes(unittest.TestCase):
    def test_keeps_valid_boxes_up_to_qty(self):
        raw = {'items': [{'id': 0, 'boxes': [[100, 200, 400, 600], [120, 650, 380, 900], [1, 2, 3, 4]]},
                         {'id': 1, 'boxes': [[500, 'x', 600, 700], [600, 300, 500, 400], [-50, 10, 1200, 90]]},
                         {'id': 9, 'boxes': [[1, 1, 2, 2]]}]}
        out = core.clean_boxes(raw, {0: 2, 1: 1})
        self.assertEqual(out[0], [[100, 200, 400, 600], [120, 650, 380, 900]])   # cut to qty
        self.assertEqual(out[1], [[0, 10, 1000, 90]])                            # clamped; bad and empty boxes dropped
        self.assertNotIn(9, out)                                                  # not in the list

    def test_tolerates_a_bare_list_and_junk(self):
        self.assertEqual(core.clean_boxes([{'id': 0, 'boxes': [[0, 0, 10, 10]]}], {0: 1}), {0: [[0, 0, 10, 10]]})
        self.assertEqual(core.clean_boxes('nonsense', {0: 1}), {})


if __name__ == '__main__':
    unittest.main()


class RenderOthers(unittest.TestCase):
    def test_keeps_other_furniture_with_known_categories(self):
        raw = {'others': [{'category': 'stool_bench', 'label': 'black stool', 'boxes': [[400, 100, 600, 150], [400, 200, 600, 250]],
                           'dims_in': {'width': 16, 'depth': 16, 'height': 30, 'weight': 9}},
                          {'category': 'spaceship', 'label': 'thing', 'boxes': [[1, 1, 50, 50]], 'dims_in': {'width': -3}},
                          {'category': 'sofa', 'boxes': []}]}
        out = core.clean_others(raw)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['dims_in'], {'width': 16.0, 'depth': 16.0, 'height': 30.0})
        self.assertEqual(len(out[0]['boxes']), 2)
        self.assertEqual((out[1]['category'], out[1]['dims_in']), ('other', {}))

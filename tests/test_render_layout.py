import sys, pathlib, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'api'))
import _core as core


class RenderLayout(unittest.TestCase):
    def test_keeps_image_points_and_room_lines(self):
        raw = {'floor': '#aabbcc', 'room': {'back_left': [210, 430], 'back_right': [820, 420], 'left_near': [-150, 980], 'right_near': [1180, 990]},
               'items': [{'id': 0, 'body': '#112233', 'positions': [[.5, .3, 0]],
                          'edges': [{'left': [300, 640], 'right': [700, 650], 'turn': 0}, {'left': [1, 2], 'right': [3, 4]}]}]}
        out = core.clean_render_layout(raw, {0: 1})
        self.assertEqual(out['room']['left_near'], [-150.0, 980.0])
        self.assertEqual(out['items'][0]['edges'], [{'left': [300.0, 640.0], 'right': [700.0, 650.0], 'turn': 0}])   # cut to qty
        self.assertEqual(out['items'][0]['positions'], [[.5, .3, 0]])

    def test_drops_bad_points_and_partial_rooms(self):
        raw = {'room': {'back_left': [210, 430], 'back_right': [820, 420], 'left_near': [-150, 980]},
               'items': [{'id': 0, 'edges': [{'left': [300, 'x'], 'right': [700, 650]}, {'left': [300, 9999], 'right': [700, 650]},
                                             {'left': [300, 640], 'right': [700, 650], 'turn': 7}]},
                         {'id': 5, 'edges': [{'left': [1, 1], 'right': [2, 2]}]}]}
        out = core.clean_render_layout(raw, {0: 3})
        self.assertNotIn('room', out)
        self.assertEqual(out['items'][0]['edges'], [{'left': [300.0, 640.0], 'right': [700.0, 650.0], 'turn': 0}])
        self.assertNotIn(5, out['items'])


if __name__ == '__main__':
    unittest.main()

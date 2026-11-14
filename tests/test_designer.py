import sys, pathlib, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'api'))
import _designer as d
class DesignerValidation(unittest.TestCase):
    def setUp(self):
        self.p={'id':'model-id','text':'Small sofa','quote':'max 75 inches','category':'sofa','effect':'max_width','value':'75','priority':'must','impact':'Exclude wider sofas','supersedes':'','situation':'unknown','outcome':'Fits the available space','evidence_kind':'user_statement','certainty':'explicit','scope':'room'}
        self.req={'brief':{'revision':2,'requirements':[]},'messages':[{'role':'user','text':'Sofa max 75 inches'}]}
    def check(self,p):return d.validate({'reply':'Understood','proposals':[p],'observations':['Window on left']},self.req)
    def test_valid_evidence(self):self.assertEqual(self.check(self.p)['proposals'][0]['id'],'req-3-1')
    def test_invented_quote(self):self.assertEqual(self.check({**self.p,'quote':'I like blue'})['proposals'],[])
    def test_invalid_numeric(self):
        for v in ['NaN','Infinity','-2','0','abc']:self.assertEqual(self.check({**self.p,'value':v})['proposals'],[])
    def test_no_phantom_photo_analysis(self):self.assertEqual(self.check(self.p)['observations'],[])
    def test_habit_scope_and_profile_are_validated(self):
        p={**self.p,'effect':'sofa_lifestyle','value':'cross_legged','priority':'prefer'}
        self.assertEqual(len(self.check(p)['proposals']),1)
        self.assertEqual(self.check({**p,'scope':'candidate'})['proposals'],[])
        self.assertEqual(self.check({**p,'value':'magical_comfort'})['proposals'],[])
    def test_room_facts_are_distinct_from_product_limits(self):
        p={**self.p,'category':'all','effect':'room_width','value':'157.48'}
        self.assertEqual(self.check(p)['proposals'][0]['effect'],'room_width')
        self.assertEqual(self.check({**p,'category':'sofa'})['proposals'],[])
        self.assertEqual(self.check({**p,'effect':'room_type','value':'imaginary'})['proposals'],[])
    def test_safe_service_error(self):
        self.assertEqual(d.client_error(RuntimeError('Gemini HTTP 429: spending cap'))['code'],'quota')
        self.assertEqual(d.client_error(TimeoutError())['code'],'timeout')
        self.assertNotIn('secret',d.client_error(RuntimeError('secret'))['error'])
    def test_unknown_replacement(self):self.assertEqual(self.check({**self.p,'supersedes':'does-not-exist'})['proposals'],[])
if __name__=='__main__':unittest.main()

class DesignerActions(unittest.TestCase):
    def test_actions_are_bounded_to_supplied_choices_and_latest_quote(self):
        req={'messages':[{'role':'user','text':'换成蓝色'}], 'editable':{'productId':'sofa','variants':[{'id':'blue'}],'alternatives':[{'id':'alt'}]}}
        result={'reply':'待执行','actions':[{'type':'color','productId':'sofa','variantId':'blue','quote':'换成蓝色'},{'type':'replace','productId':'invented','variantId':'','quote':'换成蓝色'},{'type':'render','quote':'旧消息'}]}
        self.assertEqual(len(d.validate(result,req)['actions']),1)
    def test_photo_inference_cannot_become_binding_requirement(self):
        t=DesignerValidation();t.setUp();self.assertEqual(t.check({**t.p,'evidence_kind':'agent_inference','certainty':'tentative'})['proposals'],[])

class RoomUnits(unittest.TestCase):
    def test_metric_room_size_is_not_rounded_by_model(self):
        t=DesignerValidation();t.setUp();t.req['messages']=[{'role':'user','text':'实测宽400厘米、深500厘米'}]
        p={**t.p,'quote':'实测宽400厘米、深500厘米','category':'all','effect':'room_width','value':'157'}
        self.assertAlmostEqual(float(t.check(p)['proposals'][0]['value'])*2.54,400)

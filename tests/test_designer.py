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
    def test_unknown_replacement(self):self.assertEqual(self.check({**self.p,'supersedes':'does-not-exist'})['proposals'],[])
if __name__=='__main__':unittest.main()

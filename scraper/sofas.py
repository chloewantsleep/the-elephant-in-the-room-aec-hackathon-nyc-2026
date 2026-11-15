"""Refresh all sofa annotations from their exact official product pages. No model guesses."""
import sys, json, re, hashlib
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0,str(Path(__file__).parent))
from common import fetch, parse_inches
ROOT=Path(__file__).resolve().parents[1]
FIELDS={'seat_depth':'Seat depth','seat_width':'Seat width','seat_height':'Seat height','arm_height':'Armrest height','arm_width':'Armrest width','bed_width':'Bed width','bed_length':'Bed length','width':'Width','depth':'Depth','height':'Height'}

def extract(html,p):
    pp=None
    for raw in re.findall(r'<script[^>]*type="text/hydrate"[^>]*>(.*?)</script>',html,re.S):
        data=json.loads(raw)
        candidate=data.get('0',{}).get('loaderData',{}).get('pageProps')
        if candidate and 'productInformationSectionProps' in candidate:
            identity=candidate.get('productSummaryProps',{}).get('visibleItemNo','').replace('.','')
            if identity == p['id'].split(':')[1].lstrip('s'): pp=candidate;break
    if pp is None:raise ValueError('Product information block missing')
    # Product summary identity is checked independently of any recommendations in page HTML.
    # Exact article number matched above; family names alone are insufficient.
    info=pp['productInformationSectionProps'];measure=info['measurementsProps'];details=info['productDetailsProps']
    # Persist only the owning product block, never related-product data or packaging measurements.
    source={'sku':p['id'],'url':p['url'],'retrieved_at':datetime.now(timezone.utc).isoformat(),'measurements':measure.get('measurements',[]),'details':details}
    sourcepath='data/sofas/'+p['id'].split(':')[1]+'.json'
    (ROOT/sourcepath).write_text(json.dumps(source,ensure_ascii=False,indent=2))
    attrs={}
    def put(key,value,quote,method='manufacturer'):
        attrs[key]={'value':value,'status':'documented','evidence':{'url':p['url'],'artifact':sourcepath,'quote':quote,'method':method}}
    named={m['name']:m['measure'] for m in source['measurements']}
    for key,label in FIELDS.items():
        if label in named:
            val=parse_inches(named[label]);
            if val is not None:put(key,val,label+': '+named[label])
    # Sleeper pages sometimes use total width/minimum depth; never substitute bed width for seat width.
    for key,labels in [('width',['Max. width']),('depth',['Depth, min.','Min. depth'])]:
        if key not in attrs:
            for label in labels:
                if label in named and parse_inches(named[label]) is not None:put(key,parse_inches(named[label]),label+': '+named[label]);break
    texts=[]
    def strings(x):
        if isinstance(x,str):texts.append(x)
        elif isinstance(x,list):
            for v in x:strings(v)
        elif isinstance(x,dict):
            for k,v in x.items():
                if k not in ['url','id','type','image','images']:strings(v)
    strings(details)
    # Only explicit vendor wording is used. Absence never becomes false.
    patterns={
      'padded_arms':r'(armrests?.{0,100}(padding|padded|soft)|(?:padding|padded|soft).{0,70}armrests?)',
      'wide_arms':r'wide armrests?',
      'low_arms':r'low armrests?',
      'washable_cover':r'(cover.{0,120}machine wash|machine wash.{0,100}cover)',
      'removable_cover':r'(cover.{0,80}(remov|take off)|remov.{0,40}cover)',
      'sleeper':r'(converts?.{0,50}bed|turn.{0,80}bed|sofa.?bed|sleeper)',
      'storage':r'storage (space|under|in|for)|under.{0,30}storage',
    }
    for key,pattern in patterns.items():
        hit=next((t for t in texts if re.search(pattern,t,re.I)),None)
        if hit:put(key,True,hit)
    for key,pattern in [('removable_cover',r'non.removable cover|cover (is |can)not be removed'),('washable_cover',r'do not wash')]:
        hit=next((t for t in texts if re.search(pattern,t,re.I)),None)
        if hit and (key not in attrs or key=='removable_cover' and 'non.removable' in pattern and not any(re.search(r'(?<!non-)(?<!non )removable cover',t,re.I) for t in texts)):
            put(key,False,hit)
    if any(re.search(r'non.removable cover',t,re.I) for t in texts) and any(re.search(r'(?<!non-)(?<!non )removable cover',t,re.I) for t in texts):
        attrs['removable_cover']={'value':None,'status':'conflicting','evidence':None}
    # A material listing for the ARMREST FRAME explicitly containing foam supports padding, not softness.
    accordion=details.get('accordionObject',{})
    mats=accordion.get('materialsAndCare',{}).get('contentProps',{}).get('materials',[])
    for group in mats:
        for mat in group.get('materials',[]):
            if 'armrest' in mat.get('part','').lower() and 'foam' in mat.get('material','').lower() and 'padded_arms' not in attrs:
                put('padded_arms',True,mat['part']+' '+mat['material'])
    for key in list(FIELDS)+list(patterns)+['firmness','back_angle','seat_compression','arm_height_above_seat']:
        attrs.setdefault(key,{'value':None,'status':'unknown','evidence':None})
    if attrs['arm_height']['value'] is not None and attrs['seat_height']['value'] is not None:
        attrs['arm_height_above_seat']={'value':round(attrs['arm_height']['value']-attrs['seat_height']['value'],3),'status':'derived','evidence':{'url':p['url'],'artifact':sourcepath,'quote':'Armrest height minus seat height','method':'arithmetic'}}
    # Conflicting dimensions remain visible as evidence but cannot influence ranking.
    for key in ['arm_width','arm_height_above_seat']:
        v=attrs[key]['value']
        if v is not None and (v<0 or key=='arm_width' and attrs['width']['value'] and v>attrs['width']['value']/3):
            attrs[key]={'value':None,'status':'conflicting','evidence':attrs[key]['evidence'],'reported_value':v}
    valid=attrs['width']['value'] is not None and attrs['depth']['value'] is not None
    if attrs['depth']['value'] is not None and attrs['seat_depth']['value'] is not None and attrs['depth']['value']<=attrs['seat_depth']['value']: valid=False
    return {'sku':p['id'],'name':p['name'],'source_url':p['url'],'attributes':attrs,'eligible':valid,'issue':None if valid else 'Outer dimensions missing or conflict with seat dimensions; not automatically recommended'}

def main():
    out={};products=json.loads((ROOT/'data/products.json').read_text())
    for p in products:
        if p['category']!='sofa':continue
        try:
            html=fetch(p['url'],min_interval=.8,retries=1)
            out[p['id']]=extract(html,p)
            print(p['name'], 'verified' if out[p['id']]['eligible'] else 'incomplete',flush=True)
        except Exception as e:
            out[p['id']]={'sku':p['id'],'name':p['name'],'source_url':p['url'],'attributes':{},'eligible':False,'issue':str(e)}
            print(p['name'],type(e).__name__,flush=True)
    (ROOT/'data/sofa-annotations.json').write_text(json.dumps({'version':1,'products':out},ensure_ascii=False,indent=2))
if __name__=='__main__':main()

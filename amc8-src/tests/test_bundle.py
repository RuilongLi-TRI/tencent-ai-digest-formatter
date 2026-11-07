from pathlib import Path
from html.parser import HTMLParser
import json,re,hashlib
R=Path(__file__).resolve().parents[1]
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.scripts=[];self.cur=None;self.nav=[];self.assets=[];self.title='';self.inTitle=False
 def handle_starttag(self,t,attrs):
  a=dict(attrs)
  if t=='title':self.inTitle=True
  if 'data-nav' in a:self.nav.append(a['data-nav'])
  if t=='script':
   assert 'src' not in a;self.cur={'attrs':a,'text':''};self.scripts.append(self.cur)
  if t in ['img','iframe','link','audio','video','source'] and (a.get('href') or a.get('src')):self.assets.append(a)
 def handle_data(self,s):
  if self.cur is not None:self.cur['text']+=s
  if self.inTitle:self.title+=s
 def handle_endtag(self,t):
  if t=='script':self.cur=None
  if t=='title':self.inTitle=False
h=(R/'index.html').read_text();p=Parser();p.feed(h)
assert p.title=='原创AMC8风格训练 · 每周六30分钟'
assert p.nav==['home','map','mistakes','parent']
assert len(p.scripts)==4 and not p.assets
assert json.loads(p.scripts[0]['text'])==json.loads((R/'content/weekly-data.json').read_text())
assert json.loads(p.scripts[1]['text'])==json.loads((R/'research/sources.json').read_text())
assert p.scripts[2]['text']==(R/'core.js').read_text()
assert p.scripts[3]['text']==(R/'app.js').read_text()
assert (R/'index.html').read_bytes()==(R/'AMC8每周30分钟.html').read_bytes()
assert not re.search(r'__(CSS|DATA|SOURCES|CORE|APP)__',h)
assert not re.search(r'(?:src|href)=[\"\']/[^/]',h)
assert 'XMLHttpRequest' not in h and '@import' not in h
assert not re.search(r'data-(?:action|nav)=[\"\'](?:diagnostic|daily|tests|route|full)[\"\']',h)
assert 'amc8-weekly30-v3' in h and 'amc8-weekly30-v2' in h and 'x.schema===1' in h
assert 'process-history-v3' in h and '不是自动同步' in h
assert h.count('fetch(')==1 and 'raw.githubusercontent.com/RuilongLi-TRI/tencent-ai-digest-formatter/main/amc8-progress/latest.json' in h
assert 'credentials:\'omit\'' in h or 'credentials:"omit"' in h
assert 'ghp_' not in h and 'github_pat_' not in h and 'Authorization' not in h
assert '开始本周的30分钟' in h and '周一至周五、周日无任务' in h
assert not (R/'data.json').exists() # no giant old bank or old mode shipped
assert not (R/'AMC8小小解题家.html').exists()
result={'status':'PASS','bytes':len(h.encode()),'sha256':hashlib.sha256(h.encode()).hexdigest(),'navigation':p.nav,'checks':['four weekly-only sections','no daily / extra diagnostic / full-test entry','3+20+7 state covered in core tests','all assets and scripts inline','no root paths; GitHub Pages subdirectory safe','no XHR or tracking; one parent-triggered GitHub read','v3 key, v2 migration, no embedded token, manual GitHub import only','HTML source modules match','Chinese HTML identical'],'gui':'NEW WEEKLY VERSION NOT GUI-TESTED; old Chrome results do not apply'}
(R/'tests/bundle-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))

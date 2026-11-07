"""Build portable, subdirectory-safe, single-file weekly training HTML. No external dependencies."""
from pathlib import Path
import json,hashlib
R=Path(__file__).parent;h=(R/'template.html').read_text()
for token,name in [('CSS','style.css'),('DATA','content/weekly-data.json'),('SOURCES','research/sources.json'),('CORE','core.js'),('APP','app.js')]:
 content=(R/name).read_text()
 if token in ['DATA','SOURCES']:content=json.dumps(json.loads(content),ensure_ascii=False,separators=(',',':'))
 h=h.replace('__'+token+'__',content)
for name in ['index.html','AMC8每周30分钟.html']:(R/name).write_text(h)
print('weekly HTML',len(h.encode()),'bytes',hashlib.sha256(h.encode()).hexdigest())

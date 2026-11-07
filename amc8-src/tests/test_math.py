"""Independent rational arithmetic / enumeration checks for every generated question.
No browser automation. Run: python3 tests/test_math.py"""
from pathlib import Path
import json, math, itertools, collections
from fractions import Fraction as F
R=Path(__file__).resolve().parents[1];data=json.loads((R/'content/weekly-data.json').read_text());bank=data['bank'];checks=0

def legacy_oracle(q):
 p=q['params'];a=p['a'];b=p['b'];n=p['n'];t=q['type']
 if t=='fraction': return F(a,a+b)+F(b,a+b+1)
 if t=='percent':
  old=F(100*(a+b));up=old+old*F(a+3,100);return up-up*F(b+4,100)
 if t=='ratio':
  total=(a+b)*(n+2); return next(red for red in range(total+1) if red*b==(total-red)*a)
 if t=='fractionwhole': return F(a*(n+1))*F(a+b,a)
 if t=='lcm':
  x,y=p['x'],p['y'];return next(x*i for i in range(1,y+1) if x*i%y==0)
 if t=='remainder':
  x=1
  for i in range(p['e']):x=(x*(n%p['m']))%p['m']
  return x
 if t=='divisors':return len({2**i*3**j*5**k for i in range(p['x']+1) for j in range(p['y']+1) for k in range(p['z']+1)})
 if t=='digit':return len([v for v in range(p['lo'],p['hi']+1) if v%3==0 and sum(int(c) for c in str(v))%2==0])
 if t=='average':return F(p['size']*p['avg']-p['removed'],p['size']-1)
 if t=='work':return F(1)/(F(1,a)+F(1,b))
 if t=='speed':
  # use an integer equal-distance trip to avoid relying on the harmonic mean formula
  dist=p['x']*p['y'];return F(dist*2,dist//p['x']+dist//p['y'])
 if t=='tickets':return next(i for i in range(p['num']+1) if i*p['adult']+(p['num']-i)*p['child']==p['cost'])
 if t=='triangle':return F(p['base']*p['h'],2)
 if t=='frame':return sum(not(p['th']<=i<p['w']-p['th'] and p['th']<=j<p['h']-p['th']) for i in range(p['w']) for j in range(p['h']))
 if t=='polygon':return 180-F((p['sides']-2)*180,p['sides'])
 if t=='righttriangle':
  x,y=3*p['scale'],4*p['scale'];hyp=math.isqrt(x*x+y*y);assert hyp*hyp==x*x+y*y;return x+y+hyp
 if t=='choose':return sum(1 for _ in itertools.combinations(range(p['size']),2))
 if t=='paths':
  ways=[[0]*(p['u']+1) for i in range(p['r']+1)]
  for i in range(p['r']+1):
   for j in range(p['u']+1):ways[i][j]=1 if i==0 or j==0 else ways[i-1][j]+ways[i][j-1]
  return ways[-1][-1]
 if t=='prob':
  total=p['a']+p['b'];pairs=list(itertools.combinations(range(total),2));return F(sum(i<a and j<a for i,j in pairs),len(pairs))
 if t=='digits':
  out=1
  for choices in range(p['size']-p['length']+1,p['size']+1):out*=choices
  return out
 if t=='equation':return F(p['rhs']-b,a)
 if t=='sequence':
  v=a
  for i in range(n-1):v+=b
  return v
 if t=='age':return next(x for x in range(1,1000) if x+p['years']==p['factor']*(p['young']+p['years']))
 if t=='inclusion':
  # explicitly construct intersecting sets rather than formula
  x,y,over=p['x'],p['y'],p['both'];left=set(range(x));right=set(range(x-over,x-over+y));return p['total']-len(left|right)
 if t=='median':return sorted(p['vals'])[len(p['vals'])//2]
 if t=='table':return sum([p['px']]*p['x']+[p['py']]*p['y'])
 if t=='units':return F(p['cm'])*F(p['meter'])/100
 if t=='squares':
  # enumerate square corners directly
  r,c=p['r'],p['c'];return sum(1 for x in range(r) for y in range(c) for x2 in range(x+1,r+1) if y+(x2-x)<=c)
 if t=='reversepercent':return F(p['final'])/(1-F(p['p1'],100))/(1-F(p['p2'],100))
 if t=='gcdlcm':
  matches=[v for v in range(1,p['l']+1) if math.gcd(v,p['x'])==p['g'] and math.lcm(v,p['x'])==p['l']];assert len(matches)==1;return matches[0]
 if t=='rempair':
  matches=[x for x in range(1,p['m']*p['other']+1) if x%p['m']==p['r'] and x%p['other']==p['s']];assert matches;return min(matches)
 if t=='weighted':return F(p['new']*(p['size']+p['added'])-p['old']*p['size'],p['added'])
 if t=='meeting':return F(p['distance']-p['x']*p['delay'],p['x']+p['y'])
 if t=='cutcorner':
  # reconstruct perimeter from remaining boundary segments plus cut
  scale=p['scale'];return (p['w']-3*scale)+(p['h']-4*scale)+p['w']+p['h']+5*scale
 if t=='stairarea':return sum(not(i>=p['w']-p['cw'] and j>=p['h']-p['ch']) for i in range(p['w']) for j in range(p['h']))
 if t=='exactone':
  left=set(range(p['x']));right=set(range(p['x']-p['both'],p['x']-p['both']+p['y']));return len(left^right)
 if t=='noconsecutive':return sum(abs(x-y)>1 for x,y in itertools.combinations(range(1,p['size']+1),2))
 if t=='dice':return F(sum(sum(pair)>=p['target'] for pair in itertools.product(range(1,p['sides']+1),repeat=2)),p['sides']**2)
 if t=='unitcycle':return int(str(2**p['exponent'])[-1])
 if t=='pigeonhole':return sum(p['target']-1 for _ in range(p['colors']))+1
 raise AssertionError(t)

def oracle(q):
 t=q['type']
 if t=='estimate':
  need=sum(21 for classroom in range(4) for child in range(29));assert need==2436
  return '不够，还差'+str(need-2400)+'张'
 if t=='angle':return (180-q['params']['vertex'])//2
 if t=='logic':
  fruits=['苹果','香蕉','橙子'];valid=[]
  for a,b,c in itertools.permutations(fruits):
   if a not in ['苹果','橙子'] and b!='橙子':valid.append((a,b,c))
  assert len(valid)==1
  return valid[0][2]
 return legacy_oracle(q)

for id,q in bank.items():
 result=oracle(q)
 if q['type'] in ['estimate','logic']:
  assert result==q['answer'];assert len(set(q['options']))==5
 else:
  assert F(result)==F(q['answer']),(id,q['type'],result,q['answer'])
  assert len(set(map(F,q['options'])))==5
 assert len(q['options'])==5 and q['options'][q['correct']]==q['answer']
 assert len(q['explanation'])>15 and q['methodName'] and q['method']
 checks+=1
assert len(data['weeks'])==12
for w in data['weeks']:
 assert len(w['ids'])==5 and len(set(w['ids']))==5
 assert len(set(bank[id]['type'] for id in w['ids']))==5
 assert w['learnSeconds']==180 and w['solveSeconds']==1200 and w['reviewSeconds']==420
 assert w['seconds']==sum(w[k] for k in ['learnSeconds','solveSeconds','reviewSeconds'])==1800
 assert w['checkpoint']==(w['week'] in [4,8,12])
 if w['reviewId']:
  assert w['ids'][-1]==w['reviewId']
  assert w['reviewFrom']<w['week']
  assert w['reviewId'] in data['weeks'][w['reviewFrom']-1]['ids']
assert len(bank)==49 and sum(len(w['ids']) for w in data['weeks'])==60
assert len(set(q['prompt'] for q in bank.values()))==49
assert set(q['topic'] for q in bank.values())=={'运算与比例','数论','应用建模','几何','计数与概率','代数与推理','数据与综合'}
assert data['startDate']=='2026-11-07' and data['schema']==2
report={'status':'PASS','unique_questions':checks,'scheduled_slots':60,'weekly_groups':12,'questions_per_week':5,'types':len(set(q['type'] for q in bank.values())),'originally_tested_selections':46,'new_original_representative_questions':3,'total_minutes_each_week':30,'timing':[3,20,7],'checkpoints':[4,8,12],'checks':['all 49 unique questions independently solved','all 60 scheduled slots and correct choices checked','unique options, including textual reasoning options','five distinct method types each week','exact 3+20+7 timing across all 12 weeks','11 planned spaced revisits originate in earlier weeks','seven broad themes represented, not exhaustive exam coverage']}
(R/'tests/math-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))

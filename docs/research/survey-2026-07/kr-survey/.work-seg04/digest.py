import json, sys, re

def num(s):
    try: return round(float(str(s).replace('px','')),1)
    except: return None

def digest(p):
    d = json.load(open(p))
    if 'error' in d:
        print('URL', d['url'], 'ERROR', d['error'][:200]); return
    m = d['main']
    lum = {x['i']: x for x in d.get('sectionLum', [])}
    print('== URL', d['url'], '| final', d.get('finalUrl'), '| status', d.get('status'))
    print('screens(desktop)', m['screens'], '| mobileScreens', d.get('mobileScreens'),
          '| scrollH', m['scrollHeight'], '| nsec', len(m['sections']))
    print('heroLum', d['heroLum'], 'belowNav', d.get('heroLumBelowNav'))
    print('hero:', json.dumps(m.get('hero'), ensure_ascii=False)[:900])
    print('type:', json.dumps(m.get('type'), ensure_ascii=False)[:900])
    print('motion:', json.dumps(m.get('motion'), ensure_ascii=False)[:600])
    print('features:', json.dumps(m.get('features'), ensure_ascii=False)[:1200])
    print('revealCfg:', json.dumps(m.get('revealCfg'), ensure_ascii=False)[:300])
    # reveal delta
    pre = {x['id']: x for x in m.get('revealPre', [])}
    post = {x['id']: x for x in d.get('revealPost', [])}
    revealed = []
    for i, a in pre.items():
        b = post.get(i)
        if not b: continue
        if a['op'] < 0.15 and b['op'] > 0.5:
            revealed.append({'op': [a['op'], b['op']], 'tr': a.get('tr'), 'td': a.get('td'),
                             'tf': a.get('tf'), 'tp': a.get('tp'), 'ad': a.get('ad'),
                             'an': a.get('an'), 'af': a.get('af'), 'aos': a.get('aos'),
                             'aosD': a.get('aosD'), 'aosE': a.get('aosE')})
        elif a.get('tr') and b.get('tr') and a['tr'] != b['tr'] and a['op'] > 0.5:
            revealed.append({'transformOnly': [a['tr'], b['tr']], 'td': a.get('td'),
                             'tf': a.get('tf'), 'tp': a.get('tp'), 'aos': a.get('aos')})
    print('revealCandidates', len(pre), 'revealedCount', len(revealed))
    for r in revealed[:6]:
        print('   R:', json.dumps(r, ensure_ascii=False)[:260])
    print('--- SECTIONS ---')
    for s in m['sections']:
        L = lum.get(s['i'], {})
        print(f"[{s['i']}] {s['tag']} top={s['absTop']} h={s['h']} chars={s['chars']} media={s['media']} "
              f"bgLum={s['bgLum']} pxLum={L.get('mean')} dark={L.get('darkFrac')}")
        print('     H:', json.dumps(s['headings'], ensure_ascii=False)[:220])
        print('     T:', s['keyText'][:300].replace('\n', ' '))
    print('--- OUTLINE ---')
    for o in m.get('outline', [])[:30]:
        print(f"   y={o['y']} {o['tag']} {o['t'][:70]}")
    print('--- FIXED top ---')
    for f in d.get('fixedTop', []):
        print('  ', json.dumps(f, ensure_ascii=False)[:400])
    print('--- FIXED mid ---')
    for f in d.get('fixedMid', []):
        print('  ', json.dumps(f, ensure_ascii=False)[:500])
    print('--- FIXED mobile ---')
    for f in d.get('mobileFixed', []):
        print('  ', json.dumps(f, ensure_ascii=False)[:500])

for p in sys.argv[1:]:
    digest(p); print('\n')

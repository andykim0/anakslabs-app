#!/usr/bin/env python3
import json
import math
from pathlib import Path

ROOT = Path('/private/tmp/clinic-route')


def quantile(values, q):
    ordered = sorted(values)
    if not ordered:
        return 0
    position = (len(ordered) - 1) * q
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return ordered[low]
    weight = position - low
    return ordered[low] * (1 - weight) + ordered[high] * weight


def distribution(values):
    return {
        '0': sum(value == 0 for value in values),
        '(0,0.25)': sum(0 < value < 0.25 for value in values),
        '[0.25,0.5)': sum(0.25 <= value < 0.5 for value in values),
        '[0.5,0.75)': sum(0.5 <= value < 0.75 for value in values),
        '[0.75,1)': sum(0.75 <= value < 1 for value in values),
        '1': sum(value == 1 for value in values),
    }


def stats(values):
    return {
        'minimum': min(values, default=0),
        'p25': quantile(values, 0.25),
        'median': quantile(values, 0.5),
        'p75': quantile(values, 0.75),
        'maximum': max(values, default=0),
        'distribution': distribution(values),
    }


raw = json.loads((ROOT / 'placement-raw.json').read_text())
sites = raw['sites']
summary = {
    'version': 1,
    'eligibleSiteCount': len(sites),
    'sourcePageCount': sum(site['sourcePageCount'] for site in sites),
    'baselineOutputPageCount': sum(site['baselineOutputPageCount'] for site in sites),
    'afterOutputPageCount': sum(site['afterOutputPageCount'] for site in sites),
    'sourceBlockCount': sum(site['sourceBlockCount'] for site in sites),
    'targetBlockCount': sum(site['targetBlockCount'] for site in sites),
    'legitimateExclusionCount': sum(site['legitimateExclusionCount'] for site in sites),
    'baseline': {
        'totalPlacementRate': stats([site['baseline']['totalPlacementRate'] for site in sites]),
        'bodyPlacementRate': stats([site['baseline']['bodyPlacementRate'] for site in sites]),
    },
    'after': {
        'totalPlacementRate': stats([site['after']['totalPlacementRate'] for site in sites]),
        'bodyPlacementRate': stats([site['after']['bodyPlacementRate'] for site in sites]),
        'unplacedTargetBlockCount': sum(site['after']['unplacedTargetBlockCount'] for site in sites),
    },
    'pageCompression': {
        'sitesWithOneToFourOutputPagesBefore': sum(
            1 <= site['baselineOutputPageCount'] <= 4 for site in sites
        ),
        'sitesWithOneToFourOutputPagesAfter': sum(
            1 <= site['afterOutputPageCount'] <= 4 for site in sites
        ),
        'sitePageCounts': [
            {
                'siteId': site['siteId'],
                'source': site['sourcePageCount'],
                'baseline': site['baselineOutputPageCount'],
                'after': site['afterOutputPageCount'],
            }
            for site in sites
        ],
    },
    'exclusions': {
        key: sum(site['exclusionBreakdown'][key] for site in sites)
        for key in ['footer-legal', 'navigation-label', 'skip-link', 'overlay-ui-chrome']
    },
}
(ROOT / 'placement-summary.json').write_text(
    json.dumps(summary, ensure_ascii=False, indent=2) + '\n'
)
print(json.dumps(summary, ensure_ascii=False, indent=2))

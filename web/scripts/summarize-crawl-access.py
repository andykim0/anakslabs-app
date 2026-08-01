#!/usr/bin/env python3
import hashlib
import json
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

REPO = Path(__file__).resolve().parents[2]
CORPUS = REPO / 'docs/research/corpus-2026-08'
OUT = Path('/private/tmp/crawl-access')
BEFORE = Path('/private/tmp/engine-robust/final-v2/summary.json')
RETRY = Path('/private/tmp/crawl-access-retry/driver-report.json')
SHA_BEFORE = Path('/private/tmp/crawl-access-corpus-sha-before.json')
NAV = OUT / 'navigation-analysis.json'
MODAL = OUT / 'modal-residue-analysis.json'
PLACEMENT = Path('/private/tmp/clinic-route/placement-raw.json')
INTEGRITY = CORPUS / 'integrity-report.json'

FORBIDDEN = {
    'leegajeong.com', 'gwgclinic.co.kr', 'ysfirst.com', 'kingsdental.co.kr',
    'reandyoung.co.kr', 'sproposeps.com', 'meclinicbeauty.com', 'gangnamhifu.com',
    'rubyps.co.kr',
}


def load(path):
    return json.loads(path.read_text())


def host(url):
    value = (urlsplit(url).hostname or '').lower()
    return value[4:] if value.startswith('www.') else value


def reason_class(reason):
    if not reason:
        return 'success'
    if '공개 HTTP 주소' in reason:
        return 'dns_or_public_endpoint_unavailable'
    if '지정 URL 수집을 허용하지' in reason:
        return 'robots_explicitly_blocked'
    if 'robots.txt 대신 HTML' in reason:
        return 'robots_html_response'
    if 'robots.txt가 정상 응답하지' in reason:
        return 'robots_non_success_status'
    if 'robots.txt를 확인할 수 없어' in reason:
        return 'robots_fetch_unavailable'
    if '수집 가능한 HTML 페이지' in reason:
        return 'no_renderable_html'
    return 'other'


def sha_proof():
    baseline = load(SHA_BEFORE)
    changed = []
    missing = []
    for row in baseline['files']:
        file = CORPUS / row['path']
        if not file.exists():
            missing.append(row['path'])
            continue
        actual = hashlib.sha256(file.read_bytes()).hexdigest()
        if actual != row['sha256']:
            changed.append({
                'path': row['path'],
                'before': row['sha256'],
                'after': actual,
            })
    return {
        'baselineEligibleSiteCount': baseline['eligibleSiteCount'],
        'baselineFileCount': baseline['fileCount'],
        'baselineBytes': baseline['bytes'],
        'unchangedFileCount': baseline['fileCount'] - len(changed) - len(missing),
        'changed': changed,
        'missing': missing,
    }


def main():
    before = load(BEFORE)
    retry = load(RETRY)
    nav = load(NAV)
    modal = load(MODAL)
    placement = load(PLACEMENT)
    integrity = load(INTEGRITY)
    before_failures = {
        host(row['target']['url']): row
        for row in before['results']
        if row['crawl']['status'] != 'success'
    }
    after_results = {host(row['target']['url']): row for row in retry['results']}
    retry_rows = []
    for hostname in sorted(before_failures):
        old = before_failures[hostname]
        new = after_results[hostname]
        retry_rows.append({
            'host': hostname,
            'url': new['target']['url'],
            'beforeStatus': old['crawl']['status'],
            'beforeReason': old['crawl'].get('failureReason'),
            'beforeReasonClass': reason_class(old['crawl'].get('failureReason')),
            'afterStatus': new['crawl']['status'],
            'afterReason': new['crawl'].get('failureReason'),
            'afterReasonClass': reason_class(new['crawl'].get('failureReason')),
            'pageCount': new['crawl']['pageCount'],
        })
    before_reasons = Counter(row['beforeReasonClass'] for row in retry_rows)
    after_reasons = Counter(row['afterReasonClass'] for row in retry_rows)
    forbidden_rows = [row for row in retry_rows if row['host'] in FORBIDDEN]

    pre_append_sites = [
        site for site in nav['sites']
        if site['siteId'] != '031-kr-smileface.dental-db8d8e56fb'
    ]
    nav['preAppend47Totals'] = {
        'siteCount': len(pre_append_sites),
        'navigationLabelCount': sum(site['navigationLabelCount'] for site in pre_append_sites),
        'crawledDestinationLabelCount': sum(
            site['crawledDestinationLabelCount'] for site in pre_append_sites
        ),
        'uncrawledDestinationLabelCount': sum(
            site['uncrawledDestinationLabelCount'] for site in pre_append_sites
        ),
        'noInternalDestinationLabelCount': sum(
            site['noInternalDestinationLabelCount'] for site in pre_append_sites
        ),
        'crawledPageCount': sum(site['crawledPageCount'] for site in pre_append_sites),
        'estimatedOriginalPageCount': sum(
            site['estimatedOriginalPageCount'] for site in pre_append_sites
        ),
        'uncrawledDestinationCount': sum(
            site['uncrawledDestinationCount'] for site in pre_append_sites
        ),
    }

    placement_sites = placement['sites']
    existing = [site for site in placement_sites if site['siteId'] != '031-kr-smileface.dental-db8d8e56fb']
    existing_renderable = [site for site in existing if site['after']['compileStatus'] == 'success']
    appended = [site for site in placement_sites if site['siteId'] == '031-kr-smileface.dental-db8d8e56fb']
    placement_regression = {
        'existingEligibleSiteCount': len(existing),
        'existingRenderableSiteCount': len(existing_renderable),
        'existingFailClosedSiteCount': len(existing) - len(existing_renderable),
        'existingRenderableBodyPlacement100Count': sum(
            site['after']['bodyPlacementRate'] == 1 for site in existing_renderable
        ),
        'existingRenderableUnplacedTargetBlockCount': sum(
            site['after']['unplacedTargetBlockCount'] for site in existing_renderable
        ),
        'existingRenderableBlockIntegrityViolationCount': sum(
            site['after']['renderBlockViolationCount'] for site in existing_renderable
        ),
        'appended': appended,
    }

    report = {
        'generatedAt': retry['generatedAt'],
        'issuance': False,
        'issuanceDatabase': None,
        'retry': {
            'targetCount': len(retry_rows),
            'beforeFailureReasons': dict(sorted(before_reasons.items())),
            'afterResults': dict(sorted(after_reasons.items())),
            'newSuccessCount': sum(row['afterStatus'] == 'success' for row in retry_rows),
            'rows': retry_rows,
            'forbiddenRegression': {
                'expectedFailureCount': len(FORBIDDEN),
                'stillFailedCount': sum(row['afterStatus'] == 'failure' for row in forbidden_rows),
                'unexpectedSuccesses': [row['host'] for row in forbidden_rows if row['afterStatus'] == 'success'],
                'rows': forbidden_rows,
            },
        },
        'navigation': nav,
        'modalResidue': modal,
        'corpusIntegrity': integrity,
        'existingCorpusShaProof': sha_proof(),
        'clinicRouteRegression': placement_regression,
        'captures': load(OUT / 'capture-evidence.json'),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'driver-report.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    )

    lines = [
        '# CRAWL-ACCESS driver report',
        '',
        '- Real preview issuance: no; database: N/A',
        f"- Retry: {len(retry_rows)} targets; new successes: {report['retry']['newSuccessCount']}",
        f"- Existing corpus SHA: {report['existingCorpusShaProof']['unchangedFileCount']}/"
        f"{report['existingCorpusShaProof']['baselineFileCount']} unchanged",
        '',
        '## Navigation',
        '',
        '| Site | Crawled labels (a) | Uncrawled labels (b) | No internal href | Crawled pages | Estimated pages | Unique uncrawled |',
        '|---|---:|---:|---:|---:|---:|---:|',
    ]
    for site in nav['sites']:
        lines.append(
            f"| {site['siteId']} | {site['crawledDestinationLabelCount']} | "
            f"{site['uncrawledDestinationLabelCount']} | {site['noInternalDestinationLabelCount']} | "
            f"{site['crawledPageCount']} | {site['estimatedOriginalPageCount']} | "
            f"{site['uncrawledDestinationCount']} |"
        )
    lines += [
        '',
        '## Retry',
        '',
        '| Host | Before | After | Pages |',
        '|---|---|---|---:|',
    ]
    for row in retry_rows:
        lines.append(
            f"| {row['host']} | {row['beforeReasonClass']} | {row['afterReasonClass']} | {row['pageCount']} |"
        )
    lines += [
        '',
        '## Modal residue',
        '',
        '| Site | Documents | Close-copy blocks | Panel-body blocks |',
        '|---|---:|---:|---:|',
    ]
    for site in modal['sites']:
        lines.append(
            f"| {site['siteId']} | {site['affectedDocumentCount']} | "
            f"{site['closeCopyBlockCount']} | {site['panelBodyBlockCount']} |"
        )
    (OUT / 'driver-report.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps({
        'output': str(OUT / 'driver-report.json'),
        'retryTargets': len(retry_rows),
        'newSuccesses': report['retry']['newSuccessCount'],
        'forbiddenUnexpectedSuccesses': report['retry']['forbiddenRegression']['unexpectedSuccesses'],
        'existingCorpusChangedFiles': len(report['existingCorpusShaProof']['changed']),
        'navUncrawledDestinations': nav['totals']['uncrawledDestinationCount'],
        'modalResidueBlocks': modal['totals']['totalModalResidueBlockCount'],
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

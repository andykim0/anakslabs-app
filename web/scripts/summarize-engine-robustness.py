#!/usr/bin/env python3
"""Aggregate ENGINE-ROBUST results. All counts are computed in Python."""
from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path
from urllib.parse import urlparse


def host(raw: str) -> str:
    value = raw if "://" in raw else f"https://{raw}"
    return (urlparse(value).hostname or "").lower().removeprefix("www.")


def spec_grades(markdown: str) -> dict[str, str]:
    result: dict[str, str] = {}
    pattern = re.compile(
        r"^\|\s*[^|]+\|\s*`([^`]+)`\s*\|.*\|\s*\*\*(L[1-4]|제외)\*\*\s*\|$"
    )
    for line in markdown.splitlines():
        match = pattern.match(line)
        if match:
            result[host(match.group(1))] = match.group(2)
    return result


def percent(numerator: int, denominator: int) -> float:
    return round(100 * numerator / denominator, 1) if denominator else 0.0


def reason_class(result: dict) -> str:
    if result["crawl"]["status"] == "failure":
        return "access"
    if result["compile"]["status"] == "failure":
        return "compile"
    if result["gates"]["status"] == "fail":
        return "gate"
    return "pass"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--driver", required=True)
    parser.add_argument("--spec", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    driver = json.loads(Path(args.driver).read_text())
    grades = spec_grades(Path(args.spec).read_text())
    results = driver["results"]
    for result in results:
        result["target"]["predictedGrade"] = grades.get(
            host(result["target"]["url"]), "unrecorded"
        )

    totals = {
        "target": len(results),
        "crawlSuccess": sum(r["crawl"]["status"] == "success" for r in results),
        "compileSuccess": sum(r["compile"]["status"] == "success" for r in results),
        "gatePass": sum(r["gates"]["status"] == "pass" for r in results),
        "tlsOptIn": sum(bool(r["tlsOptIn"]) for r in results),
        "modalRemovedNodes": sum(r["crawl"]["modalRemovedNodeCount"] for r in results),
    }
    by_grade: dict[str, dict] = {}
    for grade in ["L1", "L2", "L3", "L4", "제외", "unrecorded"]:
        rows = [r for r in results if r["target"]["predictedGrade"] == grade]
        if not rows:
            continue
        by_grade[grade] = {
            "sites": len(rows),
            "crawlSuccess": sum(r["crawl"]["status"] == "success" for r in rows),
            "crawlRate": percent(
                sum(r["crawl"]["status"] == "success" for r in rows), len(rows)
            ),
            "compileSuccess": sum(r["compile"]["status"] == "success" for r in rows),
            "compileRate": percent(
                sum(r["compile"]["status"] == "success" for r in rows), len(rows)
            ),
            "gatePass": sum(r["gates"]["status"] == "pass" for r in rows),
            "gateRate": percent(
                sum(r["gates"]["status"] == "pass" for r in rows), len(rows)
            ),
        }

    counted_failure_types = collections.Counter(reason_class(result) for result in results)
    failure_types = {
        stage: counted_failure_types.get(stage, 0)
        for stage in ("access", "parsing", "compile", "gate", "pass")
    }
    access_reasons = collections.Counter(
        result["crawl"].get("failureReason", "unknown")
        for result in results
        if result["crawl"]["status"] == "failure"
    )
    page_failure_codes = collections.Counter(
        failure["code"]
        for result in results
        for failure in result["crawl"].get("pageFailures", [])
    )
    gate_failures = collections.Counter()
    for result in results:
        measurements = result["gates"].get("measurements")
        if not measurements:
            continue
        for gate, values in measurements.items():
            if not values["pass"]:
                gate_failures[gate] += 1

    mismatches = []
    for result in results:
        grade = result["target"]["predictedGrade"]
        actual = reason_class(result)
        if (grade == "L1" and actual != "pass") or (grade == "L4" and actual == "pass"):
            mismatches.append(
                {
                    "url": result["target"]["url"],
                    "predicted": grade,
                    "actual": actual,
                }
            )

    modal_sites = [
        {
            "url": result["target"]["url"],
            "removedNodeCount": result["crawl"]["modalRemovedNodeCount"],
            "selectors": result["crawl"]["modalRemovedSelectors"],
        }
        for result in results
        if result["crawl"]["modalRemovedNodeCount"] > 0
    ]
    summary = {
        "source": driver["source"],
        "totals": totals,
        "byPredictedGrade": by_grade,
        "failureTypes": failure_types,
        "accessReasons": dict(access_reasons.most_common()),
        "partialPageFailureCodes": dict(page_failure_codes.most_common()),
        "gateFailures": dict(gate_failures.most_common()),
        "predictionMismatches": mismatches,
        "modalRelease": modal_sites,
        "captures": driver.get("captures", {}),
        "results": results,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2))

    md = [
        "# ENGINE-ROBUST 79-site summary",
        "",
        f"- Targets: {totals['target']}",
        f"- Crawl success: {totals['crawlSuccess']}/{totals['target']}",
        f"- Compile success: {totals['compileSuccess']}/{totals['target']}",
        f"- Four-gate pass: {totals['gatePass']}/{totals['target']}",
        f"- TLS opt-in runs: {totals['tlsOptIn']}",
        f"- Removed modal/backdrop roots: {totals['modalRemovedNodes']}",
        "",
        "## Predicted grade vs actual",
        "",
        "| Grade | N | Crawl | Compile | Gate |",
        "|---|---:|---:|---:|---:|",
    ]
    for grade, row in by_grade.items():
        md.append(
            f"| {grade} | {row['sites']} | {row['crawlSuccess']} "
            f"({row['crawlRate']}%) | {row['compileSuccess']} "
            f"({row['compileRate']}%) | {row['gatePass']} ({row['gateRate']}%) |"
        )
    md.extend(
        [
            "",
            "## Failure stages",
            "",
            *[f"- {key}: {value}" for key, value in failure_types.items()],
            "",
            "## Prediction mismatches",
            "",
            *[
                f"- {item['url']}: predicted {item['predicted']}, actual {item['actual']}"
                for item in mismatches
            ],
        ]
    )
    output.with_suffix(".md").write_text("\n".join(md) + "\n")


if __name__ == "__main__":
    main()

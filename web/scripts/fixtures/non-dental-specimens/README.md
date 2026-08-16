# Two invented practices, in verticals the engine has never seen

`site-ortho/` and `site-derm/` are **invented** practices — Northbank Orthopedic & Sports Medicine
and Larkfield Dermatology. No real practice is depicted, and nothing here may be presented as
client work.

They exist because the whole US corpus was dental (dental360, cameods, iddental), so every
vertical-shaped branch in the compiler was untested. These two are the control: same crawl, same
compiler, non-dental copy.

`t0-northbank-ortho.json` and `t0-larkfield-derm.json` are the artifacts the real designated crawl
produced from them.

## Reproducing the artifacts

```
node serve.mjs site-ortho 8791 &
node serve.mjs site-derm 8792 &
tsx scripts/recrawl-non-dental-specimens.ts     # or the inline runner in the ticket transcript
```

The crawl is the shipped `crawlDesignatedSite`. The one substitution is the SSRF validator:
`assertPublicHttpUrl` rejects loopback by design, since it exists to stop a *user-supplied* URL
reaching an internal network, and both ends here are ours. Robots handling, the one-request-per-
second floor, the identifiable user agent, maxPages and every extraction rule are untouched.

## What each site was built to exercise

| | ortho | derm |
|---|---|---|
| addresses | 2 distinct (drives `multiLocation`) | 1 |
| photo pool | moderate | large, to clear the T6 image gate |
| risk/limitation sentence | present on all six treatment pages | present on all six treatment pages |
| treatment page URLs | under `/services/`, plus two bare specialty slugs as a control | under `/services/` |

The two bare slugs (`/sports-medicine/`, `/joint-replacement/`) are deliberate: `TREATMENT_PATH_RE`
does not recognise non-dental specialty words, so those pages contribute no service blocks. They
are the in-corpus demonstration of that gap.

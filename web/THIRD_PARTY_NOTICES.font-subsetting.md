# Font subsetting tool notices

The following development-only dependency chain is used by `scripts/build-korean-font-subsets.ts`.
It is not imported by the Next.js production runtime.

| Package | Pinned installed version | License |
| --- | ---: | --- |
| subset-font | 2.5.0 | BSD-3-Clause |
| fontverter | 2.0.0 | BSD-3-Clause |
| harfbuzzjs | 0.10.3 | MIT |
| lodash | 4.18.1 | MIT |
| p-limit | 3.1.0 | MIT |
| wawoff2 | 2.0.1 | MIT |
| woff2sfnt-sfnt2woff | 1.0.0 | MIT |
| yocto-queue | 0.1.0 | MIT |
| argparse | 2.0.1 | Python-2.0 |
| pako | 1.0.11 | MIT |

License texts and package metadata are distributed in the corresponding npm packages installed
from `package-lock.json`. The version table above is deliberately pinned so a dependency update
cannot silently change this notice.

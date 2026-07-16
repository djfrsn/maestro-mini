# TraceUI provenance receipt

Verified: 2026-07-15

## Source authorization and baseline

Dennis Jefferson authorized publication of the extracted Go and TypeScript
source under this package's [MIT license](../../LICENSE). The source repository
history records Dennis Jefferson as the sole author of the extracted paths.

The extraction baseline is
[Maestro commit `955e60083abf55b556b2c26e159e3e8cc8340383`](https://github.com/gigabrain-os/maestro/tree/955e60083abf55b556b2c26e159e3e8cc8340383).
The original UI baseline is `internal/traceui/web-v1/src` at that commit; the
Go source paths are enumerated in the
[extraction map](references/extraction-map.md). The commit and path are
verifiable with:

```sh
git -C <source-checkout> show 955e60083abf55b556b2c26e159e3e8cc8340383:internal/traceui/web-v1/src/style.css
git -C <source-checkout> log --format='%an <%ae>' -- internal/session internal/traceui
```

## Font redistribution

Both committed fonts are unmodified copies from the
[Vercel Geist project](https://github.com/vercel/geist-font). They remain under
the SIL Open Font License 1.1 and are bundled with TraceUI rather than sold by
themselves. The required copyright notice and license accompany them in
[`licenses/OFL-1.1.txt`](licenses/OFL-1.1.txt). Each font's embedded `name`
table also records its copyright, version, and OFL 1.1 license.

| Font | Committed source asset | Embedded version | SHA-256 | Copyright recorded in the font |
| --- | --- | --- | --- | --- |
| Geist | `web/traceui/src/fonts/Geist-Variable.woff2` | 1.800 | `a369fcf5628ea2aa4e1b9e2ec6a5b3624e365bda588e1f0f2f12b564f728fbb8` | Copyright 2024 The Geist Project Authors |
| Geist Mono | `web/traceui/src/fonts/GeistMono-Variable.woff2` | 1.700 | `fba8f577f38a2bbcbe818efa6348dd58f36303a10b8737c42fefad275be563ab` | Copyright 2024 The Geist Project Authors |

The content-hashed copies under `internal/traceui/web/assets/` have the same
respective SHA-256 values. Verify the source assets with:

```sh
shasum -a 256 web/traceui/src/fonts/*.woff2
ttx -q -t name -o - web/traceui/src/fonts/Geist-Variable.woff2
ttx -q -t name -o - web/traceui/src/fonts/GeistMono-Variable.woff2
```

## Synthetic-fixture review

All committed native-session fixtures under `internal/session/testdata` were
reviewed on 2026-07-15: 12 JSONL files containing 39 record lines, including
two deliberately malformed lines. Every path is the fictitious
`/fixture/workspace`; identifiers use repeated test patterns; and transcript
text consists of short behavior labels or explicit `PRIVACY-*` and
`MALFORMED-*` sentinels. The review found no employer, user, repository,
credential, or production-session content.

The reviewed scope and privacy scan are reproducible with:

```sh
git ls-files 'internal/session/testdata/**/*.jsonl'
git ls-files -z 'internal/session/testdata/**/*.jsonl' | xargs -0 wc -l
rg -n '(gigabrain|github\.com|https?://|AKIA|api[_-]?key|password|credential|@)' internal/session/testdata
```

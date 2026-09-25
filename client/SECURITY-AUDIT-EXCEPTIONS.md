# Production dependency audit exceptions

## Transformers browser packaging — expires 2026-11-15

Inkwell uses `@huggingface/transformers` only in the browser/Tauri webview for
local sentence embeddings. The package's conditional export resolves to
`dist/transformers.web.js` and the generated client bundle uses
`onnxruntime-web`. Its npm package nevertheless declares Node-only
`onnxruntime-node`, `adm-zip`, and `sharp` as mandatory dependencies, so npm
reports their advisories even though those modules are not shipped in the
browser chunk or used to process Inkwell content.

This includes [GHSA-7q85-xj36-vmfc](https://github.com/advisories/GHSA-7q85-xj36-vmfc)
(npm advisory 1239030), which affects `adm-zip` in the Node-only
`onnxruntime-node` dependency path. The upstream fix is `adm-zip` 0.6.1 or
later; remove this advisory from the exception when the dependency is updated.

`npm run audit:production` allows only the reviewed package/advisory set in
`security-audit-exceptions.json`. It fails on any new advisory, changed browser
export, stale exception, or expiry. Before the expiry date, re-check upstream
for browser-only packaging and remove the exception as soon as possible.

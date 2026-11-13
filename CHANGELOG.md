# Changelog

## 0.1.1: Packaging (2026-11-10)

- Stop a standalone `npm install` of this package from pulling in n8n's runtime (`n8n-workflow` and `isolated-vm`). `n8n-workflow` remains a `*` peer, marked optional so npm 7+ does not auto-install it; the host n8n instance still provides it at runtime. The same package is listed in `devDependencies` for local build and tests.

## 0.1.0: Initial release (2026-11-07)

- Add render creation, retrieval, listing and output retrieval, plus preset listing.
- Add a polling trigger for completed and failed renders.
- Add Bearer API-key credentials, mocked tests and installation documentation.
- Package Eddy Woods LLC MIT license and Eddy’s WaveForge mark for light/dark icons.
- No teaser, upload or webhook trigger. Pending Tim and QC review; not published.

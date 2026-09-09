# Shared campaign viewer

A separate, editable edition for sharing detector maps, kinematics, results,
and particle transport. It starts on the hit-map page. The full local research
viewer remains in [showermax_live](../showermax_live/README.md).

This directory is its own Git repository. `main` is the shared-edition baseline;
`shared-viewer` is the working branch for refinements. Generated site files
and simulation data stay outside it. GitHub repository creation, pushing, and
public hosting are deferred until the interface is ready to publish.

## Build and preview

From the remoll folder:

```bash
python3 _local_work/background_campaign/shared_viewer/build.py
python3 _local_work/background_campaign/shared_viewer/preview.py
```

Open **http://127.0.0.1:8781/**. Press **Ctrl+C in that terminal** to stop.
The full local viewer uses a different port, so the two can be compared.

The build reads the already prepared research export at
`DATA_ROOT/background_campaign/research/browser/` and writes a separate site to
`DATA_ROOT/background_campaign/research/shared_viewer/`. It verifies product
hashes and includes only the export's producing cohort. It never reads ROOT,
runs simulations, or modifies the local research interface.

If the analysis products have changed, refresh the source export first using
[the research export command](../showermax_live/README.md#research-viewer-current-entry-point).
The shared build deliberately freezes that verified export for review.

## Edit this edition

- `assets/index.html`: page structure and static labels.
- `assets/app.js`: interactions, plots, table rendering, animation.
- `assets/style.css`: layout and palette.
- `assets/presentation.json`: short labels and number formatting.
- `assets/math.js` and `assets/stream.js`: display math and transport playback.

These are independent source files, initially adapted from the research viewer.
A shared build does not overwrite them from that viewer. Rebuild and reload the
browser after editing. Preserve the existing signal and covariance definitions
when adjusting presentation.

The shared edition has no dataset selector, refresh control, GEM reconstruction,
local measured-fit uploader, diagnostic-server link, or stop-server button.
The transport display omits the moving-particle counter and local instruction
sections. Its one-line sample description covers **all included configurations**:
simulated events scanned and sampled recorded track paths. Multiple paths may
belong to one physical track; animation repetitions are not counted as data.

The results page keeps the main-detector dilution table and appends three
ShowerMax rows after a small break: open, closed, and transition. These rows
show PE-weighted signal in PE/s, with saved regional errors where available.
They do not compute ShowerMax dilution, deconvolution, or a covariance matrix.
The three main-detector ep-inelastic component columns are merged for the
ShowerMax rows because the saved regional PE signal contains their process
total. Missing source/region statistics remain unavailable. The existing
correlation matrix covers only main-detector dilutions. Downloads add only
ShowerMax regional signals. Measured-fit placeholders, input provenance
disclosure, and historical-comparison text are omitted.

Hit-map histogram/method disclosure sections are omitted. Short units and MC
uncertainties remain beside their values; unavailable statistics stay unavailable.

## Hosting later

The generated site is plain HTML, CSS, JavaScript, and compressed JSON. Serve
the complete output directory over HTTPS from a static host, including a GitHub
Pages project subdirectory; all asset and data links are relative. There is no
Python, ROOT, GEM solver, or private analysis API on the hosted site. Browsers
load only the selected products. The build enforces 64 MiB overall and 2 MiB
per compressed product, includes `.nojekyll`, and excludes GEM model products.

A future repository should track these editable source files and the build
instructions. Upload the generated site as a deployment artifact, rather than
committing ROOT files or generated data into the analysis repository. No public
repository or deployment is created by the build or preview commands.

To build from a prepared export outside this workspace, use Python 3 and supply
both paths explicitly; that mode uses only the Python standard library:

```bash
python3 build.py --source /path/to/research-export --output /path/to/shared-site
```

Checks:

```bash
python3 -m unittest discover -s _local_work/background_campaign/shared_viewer -p 'test_*.py'
node --check _local_work/background_campaign/shared_viewer/assets/app.js
```

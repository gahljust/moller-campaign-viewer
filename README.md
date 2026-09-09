# Shared campaign viewer

A separate, editable edition for sharing detector maps, kinematics, results,
and particle transport. It starts on the hit-map page. The full local research
viewer remains in [showermax_live](../showermax_live/README.md).

This directory is its own Git repository. **`shared-viewer` publishes the website;
`main` is reserved for local work and is not pushed or deployed.** Generated site
files and simulation data stay outside Git history.

Website: https://gahljust.github.io/moller-campaign-viewer/

Source: https://github.com/gahljust/moller-campaign-viewer

## Build and preview

From the remoll folder:

```bash
python3 _local_work/background_campaign/shared_viewer/build.py
python3 _local_work/background_campaign/shared_viewer/preview.py
```

Open **http://127.0.0.1:8781/**. Press **Ctrl+C in that terminal** to stop.
The full local viewer uses a different port, so the two can be compared.

The build reads the already prepared research export and ShowerMax statistics at
`DATA_ROOT/background_campaign/research/browser/` and
`DATA_ROOT/background_campaign/research/showermax_dilution/summary.json`, then writes a separate site to
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
ShowerMax rows after a small break: open, closed, and transition. Each number
is the component's PE-weighted response divided by the total PE-weighted
response **in that region**, with its MC standard error. The same columns apply:
Møller, ep elastic, and ep-inelastic Δ, resonance, and continuum. The W boundaries
match the production main-detector analysis: [1, 1.4), [1.4, 2.5), [2.5, 6) GeV.
The extractor refuses nonzero PE signal outside those bins instead of silently
assigning it to a component.

No ShowerMax deconvolution or matrix panel is added. The existing matrix remains
main-detector-only. The downloaded ShowerMax addition contains the fractions
and their standard errors, not a new fit or matrix. In incomplete configurations,
fractions refer to the included interactions, labeled directly above the rows.

### Preparing ShowerMax statistics

The missing region-by-W statistics require one explicit ROOT analysis pass,
without rerunning simulation or modifying ROOT files. From the remoll folder:

```bash
python3 _local_work/background_campaign/shared_viewer/prepare_showermax.py
python3 _local_work/background_campaign/shared_viewer/build.py
```

Press **Ctrl+C** to stop an extraction; completed per-batch caches are reused
on restart. Only the current export's accepted fixed-quota campaigns are read.
Small additive caches and the combined summary live under
`DATA_ROOT/background_campaign/research/showermax_dilution/`; no ROOT data enter
the website. Re-run preparation after refreshing the research export. The
builder rejects statistics linked to a different export.

Scores include all forward PE crossings from a history, summed before squaring.
The saved allocation quotas define the independent strata, including zero-score
histories. Independent complete batch estimates are averaged, with variance
scaled by the square of the batch count. For each component, the compact
statistics retain its variance and covariance with the regional total, so
shared ep-inelastic sampling and uncertainty in the denominator are included:

`Var(f_i) = [Var(S_i) - 2 f_i Cov(S_i,T) + f_i² Var(T)] / T²`, where `T = Σ S_i`.

This needs no covariance across detector regions or fit with ShowerMax. These
are statistical MC errors; shared PE-model systematics are not estimated.
Every regional PE total is checked against the independently saved hit-map
summary. The LH2 component classification is also checked against the existing
main-detector template totals on each batch. Unavailable measurements are not
substituted with zero.

Hit-map histogram/method disclosure sections are omitted. Short units and MC
uncertainties remain beside their values; unavailable statistics stay unavailable.

## Statistics and detector passages

The [statistics audit](STATISTICS_AUDIT.md) records the independent ROOT checks,
historical comparisons, and distinction between physical tile entries and
calibrated detector signal. Main-quartz entry rates already include backsplash;
entry plus exit is one passage, while later reentry counts again. The ShowerMax
PE lookup has a different, forward incident-shower definition. Dilution errors
include numerator/denominator covariance and remain part of the shared results.

## Publish with GitHub Pages

The generated site is plain HTML, CSS, JavaScript, and compressed JSON. Serve
the complete output directory over HTTPS from a static host, including a GitHub
Pages project subdirectory; all asset and data links are relative. There is no
Python, ROOT, GEM solver, or private analysis API on the hosted site. Browsers
load only the selected products. The build enforces 64 MiB overall and 2 MiB
per compressed product, includes `.nojekyll`, and excludes GEM model products.

GitHub tracks the editable source on `shared-viewer`. Each published version has
a GitHub release containing the prepared website, including its compressed data.
The Pages workflow verifies that bundle against the source commit and checks
every data hash before deploying it. The analysis export stays on your computer;
GitHub does not run ROOT analysis. Build and preview commands never publish.

After editing and checking the shared viewer, run these commands **from this
directory**, with GitHub CLI (`gh`) installed and signed in:

```bash
git switch shared-viewer
# Commit the changes you want to publish, then:
git push origin shared-viewer
python3 publish.py publish
```

The last command rebuilds from the saved research export, uploads a release,
and starts deployment. It refuses an uncommitted tree, a different branch, or
a source commit that has not been pushed. Follow the resulting deployment in
[GitHub Actions](https://github.com/gahljust/moller-campaign-viewer/actions).
GitHub Pages serves the website continuously; your computer can be switched off.

Keep local-only experiments on `main`. Move selected changes to `shared-viewer`
when they are ready; do not push all branches. The workflow runs only when
explicitly requested on `shared-viewer`, so local edits and ordinary pushes
cannot replace the website. An older release can be restored from Actions using
its release tag and SHA256 after restoring that release's source commit to
`shared-viewer`. No server process is left running by the publish command.

To build from a prepared export outside this workspace, use Python 3 and supply
both paths explicitly; that mode uses only the Python standard library:

```bash
python3 build.py --source /path/to/research-export --output /path/to/shared-site \
  --showermax /path/to/showermax-summary.json
```

Checks:

```bash
python3 -m unittest discover -s _local_work/background_campaign/shared_viewer -p 'test_*.py'
node --check _local_work/background_campaign/shared_viewer/assets/app.js
```

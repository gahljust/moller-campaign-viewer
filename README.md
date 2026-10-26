# MOLLER campaign viewer

[Open the viewer](https://gahljust.github.io/moller-campaign-viewer/)

Detector hit maps, tile PE distributions, secondary sources, deconvolution,
and particle transport from remoll simulations.

`shared-viewer` is the published edition. `main` stays local.

## Run locally

From this directory in the analysis workspace, using the prepared data export:

```bash
python3 build.py --deconvolution --main-response
python3 verify_response.py /path/to/prepared/site
python3 preview.py
```

Open http://127.0.0.1:8781/. Press **Ctrl+C** to stop the preview.

## Publish updates

After committing changes on `shared-viewer`:

```bash
git push origin shared-viewer
python3 publish.py publish --site /path/to/prepared/site
```

Requires Python 3, the prepared analysis data, and an authenticated GitHub CLI.
Deployment progress appears in [Actions](https://github.com/gahljust/moller-campaign-viewer/actions).

The main-detector selector offers **Rate weighting** and **Rate × PE response**.
Deconvolution uses 2.7M develop Møller + 3M develop ep elastic + 2.55M sampled
ep inelastic events. The dilution, covariance, correlation and fit products use
this same dataset. Hit maps, PE histograms, secondaries and transport retain
their previously published samples. ShowerMax uses expected PE response.
The build checks the local analysis fingerprints and exports compact products
only. `verify_response.py` checks rate/PE units, source/map/spectrum closure and
fit identities; `node test_response.cjs` checks static response routing.

Regional selections use physical detector IDs, replacing legacy angular cuts.
ShowerMax PE lookup coordinates use the recorded module.

For the current deconvolution release, apply `update_deconvolution.py` to the
prepared baseline export with the verified payload before publishing. Its
hash and dataset identity are pinned in `deconvolution_dataset.json`; publishing
an older dataset is rejected.

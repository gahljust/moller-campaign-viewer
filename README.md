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

The main-detector selector offers **Rate weighting** and **Rate × PE response**
for the matched 8.1-million-event, 11 GeV LH2 sample. It controls the fit,
dilution and covariance matrices, correlation explorer, hit maps, secondary
creation-volume fractions, source maps and energy spectra together. Other
campaigns retain rate weighting; ShowerMax retains its existing PE response.
The build checks the local analysis fingerprints and exports compact products
only. `verify_response.py` checks rate/PE units, source/map/spectrum closure and
fit identities; `node test_response.cjs` checks static response routing.

Regional selections use physical detector IDs, replacing legacy angular cuts.
ShowerMax PE lookup coordinates use the recorded module.

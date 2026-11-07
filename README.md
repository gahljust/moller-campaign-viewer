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
The Sampled deconvolution uses 3M develop Møller + 3M develop ep elastic +
3M sampled ep inelastic events. The separate Farm comparison uses 29.79M events. The dilution, covariance, correlation and fit products use
this same dataset. Hit maps, PE histograms, secondaries and transport retain
their previously published samples. ShowerMax uses expected PE response.
The build checks the local analysis fingerprints and exports compact products
only. `verify_response.py` checks rate/PE units, source/map/spectrum closure and
fit identities; `node test_response.cjs` checks static response routing.

Regional selections use physical detector IDs, replacing legacy angular cuts.
ShowerMax PE lookup coordinates use the recorded module.

November 2 correction: main PE lookup uses total energy; kinetic-energy cuts
are unchanged. PE maps, spectra and deconvolution were reprocessed. Forecasts
remain conditional on finite simulation templates and expected PE, excluding
additional optical/electronics variance. The Changelog records the correction.

For the current deconvolution release, apply `update_deconvolution.py` to the
prepared baseline export with the verified payload before publishing. Its
hash and dataset identity are pinned in `deconvolution_dataset.json`; publishing
an older dataset is rejected.

November 7: the prepared static release includes the Farm dataset, Simulation
Uncertainty plots, and the option to exclude Ring 5 measurements. Supplementary
files are pinned by `site_extensions.json` and verified before upload and in CI.
Publish with `--site` pointing to the complete prepared release; an incomplete
legacy export is rejected. The source and data snapshot are distributed together
through the existing release bundle workflow.

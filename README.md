# MOLLER campaign viewer

[Open the viewer](https://gahljust.github.io/moller-campaign-viewer/)

Detector hit maps, dilution factors with statistical uncertainties, and animated
particle transport from remoll simulations.

`shared-viewer` is the published edition. `main` stays local.

## Run locally

From this directory in the analysis workspace, using the prepared data export:

```bash
python3 build.py
python3 preview.py
```

Open http://127.0.0.1:8781/. Press **Ctrl+C** to stop the preview.

## Publish updates

After committing changes on `shared-viewer`:

```bash
git push origin shared-viewer
python3 publish.py publish
```

Requires Python 3, the prepared analysis data, and an authenticated GitHub CLI.
Deployment progress appears in [Actions](https://github.com/gahljust/moller-campaign-viewer/actions).

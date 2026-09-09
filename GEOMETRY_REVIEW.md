# Animation geometry review — 2026-09-09

Reviewed the displayed geometry against the campaign GDML at remoll commit
`cba2ad82b057076e8fb9b5a9b193238f7960daf8`. This is a display geometry check,
not a new simulation or a mechanical survey of the apparatus.

## Findings and corrections

- **Detector positions and orientations pass.** Independently accumulated
  Geant4 navigation transforms agree with the exporter's transforms across
  2,873 placements and 112,968 exported vertices. Maximum discrepancy:
  `7.31e-12 mm`, before the display's `0.0001 mm` coordinate rounding.
- **Ring 5 has 84 tiles.** Every sector has closed, open, and two transition
  triplets. Each triplet has three tiles split across the front/back depths;
  42 tiles occupy each depth band. The bands are approximately 22.119–22.120 m
  and 22.276–22.277 m. The transverse edges mostly meet, with small differences
  from the GDML's rounded placements; no extra overlap was introduced for looks.
- **Rings 1–4 and 6 have 28 tiles each**, with 14 at each depth band. Rotating
  sector 1 onto the other six sectors agrees with the stored tile vertices to
  less than 0.094 mm across all main rings. This includes orientation, not just
  center positions. The small deviations are present in the GDML placements.
- **ShowerMax has 28 modules with four quartz layers each**, for 112 quartz
  volumes. The main-detector and ShowerMax tile meshes remain exactly identical
  to the previously published meshes.
- **Restored Collimator 2**, whose boolean apertures failed Geant4's default
  rendering tessellation. Retrying the unchanged solid with 72 rotation steps
  produces its mesh, including the seven apertures, at z = 750–900 mm. Other
  solids retain their usual rendering resolution. No placed solid remains
  unmeshed in this export.
- **Corrected the geometry grouping of 63 upstream toroid pieces**: 56 shield
  pieces and seven support bars had matched a broad ShowerMax support label.
  They now use the magnet geometry group. ShowerMax's geometry bounds are
  consequently 23.826–24.022 m, and its focus center is at 23.924 m. This change
  is confined to geometry grouping; saved statistical and creation-volume
  summaries are not reclassified in this review.
- **Target and sieve offsets agree with the campaign macros.** The target
  ladder's zero GDML translation permits the absolute optics offsets of
  +500/+550/+600 mm in y. The sieve macros shift its base placement by ±200 mm
  in x. These affect the movable assemblies, not the rest of the apparatus.

The exporter now checks its transforms against Geant4 navigation at every
geometry build. Regression checks require the recovered collimator, no missing
placed meshes, two detector depth bands, and downstream-only ShowerMax geometry.
Simulation geometry, particle paths, hit maps, and dilution statistics were not
altered. Context wireframes still use edge reduction for browser performance.

To repeat in the complete local analysis workspace, from the remoll checkout:

```bash
python3 _local_work/background_campaign/showermax_live/build_transport.py --geometry-only
python3 -m unittest _local_work.background_campaign.showermax_live.test_transport
```

Native export and packaging code live in `showermax_live/export_geometry.cc`
and `showermax_live/build_transport.py` in that workspace. The generated geometry
retains hashes of those sources and every GDML/macro input, plus the numerical
transform-check result. No ROOT events need to be reread for this review.

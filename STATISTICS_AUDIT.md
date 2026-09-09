# Detector statistics and passage audit

Audit date: 2026-09-09. Producing remoll commit:
`cba2ad82b057076e8fb9b5a9b193238f7960daf8`.

**Dilution uncertainty remains part of the calculation.** The checks below
verify its implementation and identify what the detector observable can establish.
Agreement with an older fixed-template calculation is not a substitute for this.
No production scores, crossing cuts, or main-detector matrices were changed by
this audit.

## What counts as one passage

For a physical quartz tile, count **one entry into that tile**. A particle
entering its front and leaving its back produces one passage. If it leaves and
later reenters, count a second passage. Entering another physical tile is a
separate passage, even when the same track crosses overlapping tiles.

This is already the current recording contract. The production macros enable
`surfacehits` for all 224 physical quartz volumes. In
[remollGenericDetector.cc](../../../src/remollGenericDetector.cc), recording
requires the first step at a volume boundary; interior steps and ordinary exit
steps do not create additional records. The BF and FF detector IDs refer to
separate quartz solids, not the front and back faces of one solid. Combining
them by track ID would discard real detector passages.

The current main-detector score includes both momentum directions. It does not
apply the forward-only cut used by the ShowerMax PE adapter. The audit checks
recorded positions against all six faces of the actual GDML quartz solids,
using detector-local coordinates and a 0.0001 mm tolerance. Repeated entries
are examined within each history and physical volume/copy/track identity.

The full read-only scan covered **46 configurations, 82 batches, and 8,303,000
simulated histories**. All **10,334,600** recorded main-quartz positions pass
the boundary check; there are **zero exact duplicate main entry records**.
This establishes the saved entry-record contract across the current cohort;
the full covariance comparison below specifically covers the LH2 templates.

### Backsplash in the current LH2 sample

The three LH2 campaigns contain 822,000 simulated histories and 774,635 recorded
main-quartz entries. All these recorded positions lie on a quartz boundary;
none repeat the same volume/copy/track, position, and timestamp exactly.

The following are **descriptive fractions of weighted entry rate across all
six rings**, not fractions of detected PE or confidence intervals. “Backward”
means the stored `pz < 0` state.

| Generator | Backward entries | Repeat visits to the same tile | Photon/neutron entries |
|---|---:|---:|---:|
| Møller | 48.35% | 0.27% | 78.21% |
| ep elastic | 17.39% | 0.22% | 73.56% |
| ep inelastic | 16.76% | 0.18% | 63.04% |

Creation-volume names also locate substantial backward flux in ShowerMax
materials. These are recorded birth locations, not inferred locations along
an animated trajectory. A track born elsewhere can also scatter in ShowerMax,
so a birth-location tally alone is not a complete causal attribution.

**Recorded momentum is not guaranteed to be entrance momentum.** The detector
stores position/time from the pre-step point but momentum, energy, and beta
from the updated track. Some boundary records therefore have an outward
momentum state after their first step inside quartz. This is not evidence of
an extra exit record. It prevents certifying an entrance-direction or
entrance-energy cut from these fields alone. Future simulations requiring
that distinction should save consistently paired pre-step states; existing
ROOT data cannot recover missing pre-step momenta exactly.

## What passed statistically

- A separate ROOT accumulator reproduced every saved LH2 batch main-detector
  response mean and covariance entry exactly: seven batches, with 18 coordinates
  for Møller/elastic and 54 for the three inelastic W components. It shares the
  production allocation-plan reader and detector-ID helper, but independently
  accumulates history vectors and their outer products and expresses the
  azimuth classification separately.
- Each history's detector contributions are summed before squaring. Fixed-quota
  strata include zero-score trials in their quota denominator. Independent
  complete batch estimates are averaged with variance divided by batch count
  squared. This preserves within-history shower and cross-detector correlations.
- The current exported 90 × 90 LH2 dilution covariance has rank 72, as required
  by 18 row-sum constraints. Maximum dilution normalization error is
  `1.11e-16`; maximum covariance row-sum residual is `4.82e-20`. Its smallest
  eigenvalue is `-1.25e-19`, consistent with roundoff, also checked after
  normalizing to correlation coordinates (`-1.62e-15`). It must not be forced
  to full rank or inverted as an unconstrained covariance.
- An independent end-to-end propagation reconstructs the category-major
  Jacobian and covariance from those batch moments. All four exported LH2
  selections match in their 90 fractions, 90 standard errors, and all 8,100
  covariance entries. The current matrix is therefore checked against the
  underlying moments, not only for symmetry or positive semidefiniteness.
- ShowerMax regional PE means close against the saved map totals for all
  46 configurations. The new three rows retain MC errors for each component,
  including the Δ, resonance, and continuum components with W boundaries
  [1, 1.4), [1.4, 2.5), and [2.5, 6) GeV.
- Ratio uncertainty includes covariance between numerator and denominator:
  `Var(f_i) = [Var(S_i) - 2 f_i Cov(S_i,T) + f_i² Var(T)] / T²`.
  Mutually exclusive inelastic components share fixed-quota sampling and have
  nonzero design covariance. The compact PE moments retain the terms needed
  for each error without adding a ShowerMax fit or matrix to the viewer.
- Regression checks exercise same-history cross terms, zero-score trials,
  inelastic classification, missing off-diagonal covariance, PSD checks in
  small units, common-normalization cancellation, row constraints, and fit
  Jacobians against finite differences. Correlated mock fits also recover the
  expected propagated covariance.

These are MC standard errors from a first-order ratio propagation, conditional
on the simulated processes, sampling design, and response model. They do not
certify exact finite-sample interval coverage or an unseen rare tail.

## ShowerMax and actual detector signal

The 28 ShowerMax score surfaces are thin **virtual entrance planes**, upstream
of the tungsten/quartz assembly. They are not the active quartz-volume
boundaries used for the main-detector count.

The current PE lookup models forward shower response using particle species,
energy, and position. It has no incidence-angle or reverse-incidence argument.
A particle traveling back through an upstream virtual plane can be exiting a
shower whose response was already assigned to its incident particle. Applying
the entire forward-shower PE response to that outgoing particle would not be
a justified way to add detector signal.

Some virtual-plane records repeat the same timestamp and position; some also
have different stored momentum states. The audit measures their contribution
to the existing forward PE lookup separately. A timestamp/position coincidence
is a diagnostic, not sufficient evidence to merge every such record or to
discard all later visits by a track.

Across the scan, 70,281 virtual-plane records repeat an immediately preceding
same-track position and timestamp. Only 81 such records contribute nonzero
forward PE under the existing lookup. The largest affected campaign's fraction
of total forward PE is `1.20e-7` (0.000012%); for LH2 Møller it is `8.11e-9`.
These observations are retained as diagnostics, with no blanket direction or
track-ID deduplication applied. They do not explain the large backsplash flux.

The main detector currently measures a simulated **entry-rate observable**.
Photons and neutrons do not produce the same direct Cherenkov response as an
energetic charged particle. Conversion products, path length, angle, optical
collection, and particles born inside quartz affect actual light signal.
Surface-only recording also omits interior energy-deposition sums. A calibrated
main-tile signal adapter needs those response inputs; a `pz` cut or track-ID
deduplication cannot supply them. Accordingly, this audit does not relabel
entry-rate dilution as measured-signal dilution or silently extend the PE model.

## Historical cross-checks

### Same observable, older simulation cohort

The retained [dilution history scan](../../experiments/dilution_history_scan/README.md)
applies a common detector-response reducer to separate build cohorts. Its LH2
endpoints give the following Møller fractions, with one MC standard error:

| Observable | Older `d5dd91e3` | Replacement `cba2ad82` |
|---|---:|---:|
| Ring 5 closed | 87.124% ± 2.003% | 87.400% ± 0.556% |
| Ring 5 transition | 82.942% ± 1.005% | 82.460% ± 0.447% |
| Ring 5 open | 81.844% ± 1.337% | 82.884% ± 0.473% |
| ShowerMax closed, PE weighted | 92.482% ± 1.937% | 95.873% ± 0.305% |
| ShowerMax transition, PE weighted | 94.529% ± 0.397% | 93.610% ± 0.254% |
| ShowerMax open, PE weighted | 90.500% ± 0.681% | 90.548% ± 0.286% |

The main Ring 5 values are compatible at the precision shown. ShowerMax
transition differs visibly and deserves model/sampling context; it is not
evidence that uncertainty should be removed. The older cohort lacks some
field/build/sampling provenance. These are descriptive comparisons, not a
certified independent replication or pooled dataset. The history scan uses
history-count weights across files, while the current fixed-quota viewer uses
equal weights across complete batch estimators, so its replacement endpoints
are not identical to the current viewer values.

The retained scan's rare-history checks also show why endpoint agreement cannot
prove coverage. For example, zeroing the largest observed history's contribution
while retaining normalization changes the older closed Ring 5 Møller fraction
by 1.826% on the fraction's percent scale; the corresponding replacement scan
shift is 0.230%. This is a deliberately biased sensitivity diagnostic, not an
alternative estimate or an upper bound on unobserved tails.

### Earlier group studies and matrices

| Reference | Object and scope | Valid use in this audit |
|---|---|---|
| Retained [deconvolution.C](../../../analysis/deconvolution.C) | Five fitted-asymmetry parameters; inverse weighted normal matrix with fixed simulated coefficients | Confirms the historical fit convention. Its fitted-parameter covariance is different from covariance of MC dilution estimates. |
| [2021 tiling study, Kumar/Gal](https://moller.jlab.org/DocDB/0007/000769/002/210629_MDtiling_CGal.pdf), slides 2, 10, 12 | Five-process fit; virtual plane at 26.5 m; actual tile locations, overlaps, and light-guide response identified as further checks | Confirms the inelastic W split and importance of ep elastic/inelastic correlation. Its Ring 5 share of all Møller events is not Møller purity within Ring 5. |
| [2024 MOLLER TDR](https://moller-docdb.physics.sunysb.edu/DocDB/0009/000998/003/MOLLER_TDR-24-02-15.pdf), §§7.3–7.4, Tables 26–27 | Simulated dilution inputs and five-parameter projected asymmetry fit | Table 26 lists contributions to measured asymmetry, not rate-dilution fractions. Table 27 lists fitted-asymmetry errors, not MC dilution errors. |

The TDR's approximate Ring 5 elastic-background scale (8%) and inelastic scale
(at most about 0.5%) are useful context, not matching-selection numerical
acceptance tests. The retained [processDeconv.C](../../../analysis/processDeconv.C)
feeds electron/pion `E > 1 MeV` histograms on virtual detector 28 into the old
fit. The current main tally includes photon/neutron entries in actual quartz
volumes; its denominator is also conditional on the included five generator
components. These selections must be aligned before interpreting differences
as a physics discrepancy. TDR text was checked using the retained
[local transcription](../../docs/reference/MOLLER_TDR-Final.md).

No historical matrix found in these references supplies the current
90-coordinate MC dilution covariance. The retained macro's omission of
dilution uncertainty is established; this does not establish what every past
group analysis did. Our nonzero dilution uncertainties and correlations remain
required.

## Reproduce the audit

From the remoll checkout:

```bash
python3 _local_work/background_campaign/shared_viewer/audit_statistics.py
python3 _local_work/background_campaign/shared_viewer/verify_dilution.py
python3 -m unittest discover -s _local_work/background_campaign/shared_viewer -p 'test_*.py'
python3 -m unittest _local_work.background_campaign.deconvolution.test_fit _local_work.background_campaign.deconvolution.test_package
```

The read-only ROOT audit writes compact per-batch receipts and `audit.json` to
`DATA_ROOT/background_campaign/research/statistics_audit/`. It checks input
identities, current geometry/implementation, and entry-only macro settings.
Unchanged batch receipts are reused. `--target lh2` limits a development run;
the final `audit.json` always describes only the requested scope. Press
**Ctrl+C** to stop; completed batch caches are reusable. No server is started.
The audit products are local analysis evidence and are not included in the site.
The completed receipts occupy about 0.6 MB. `dilution_closure.json` binds the
end-to-end comparison to its crossing audit, source export, and batch templates.

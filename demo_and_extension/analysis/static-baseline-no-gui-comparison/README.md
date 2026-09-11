# Static Baseline Image-Variant Re-Evaluation

This folder documents the controlled re-evaluation of the four static geo-localization baselines using two different **static image variants**.

Both variants belong to the same benchmark condition:

```text
Benchmark condition: Static / NMPZ
```

The two image variants compared here are:

1. **Original OpenGuessr static images**
2. **No-location-GUI static images**

The purpose of the rerun was to verify whether the observed performance differences were caused by the static image variant rather than by accidentally changing model, retrieval, or inference settings.

Both image variants were therefore rerun with the **current evaluator code** and the **same inference configuration**. The intended experimental difference is the image root; results are written to separate output folders.


## Image variants

### Original OpenGuessr static images

```text
demo_and_extension/data/starting-images/
├── europe-easy/
├── europe-medium/
└── europe-hard/
```

### No-location-GUI static images

```text
demo_and_extension/data/starting-images-no-gui-crop/no-location-gui/
├── europe-easy/
├── europe-medium/
└── europe-hard/
```

The no-location-GUI variant was created to remove explicit location-revealing interface elements while retaining the visual scene as consistently as possible.

## Benchmark splits

```text
europe-easy    8 locations
europe-medium  9 locations
europe-hard    8 locations
Total         25 locations
```

For retrieval-based baselines using the European OSV-5M gallery, the European gallery contains **2,174,184 images**.

## Re-evaluation procedure

All commands below are run from the repository root.

First define the three benchmark splits:

```powershell
$datasets = @("europe-easy", "europe-medium", "europe-hard")
```

---

## GeoCLIP

The two runs use the same evaluator and dataset split. Only the image root and output directory differ.

```powershell
foreach ($dataset in $datasets) {
    .\geoclip\.venv\Scripts\python.exe .\geoclip\geoclip_batch_eval.py `
        --dataset $dataset `
        --images-root .\demo_and_extension\data\starting-images `
        --output-dir .\geoclip\results

    if ($LASTEXITCODE -ne 0) { throw "GeoCLIP original failed: $dataset" }

    .\geoclip\.venv\Scripts\python.exe .\geoclip\geoclip_batch_eval.py `
        --dataset $dataset `
        --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
        --output-dir .\geoclip\results-no-location-gui

    if ($LASTEXITCODE -ne 0) { throw "GeoCLIP no-GUI failed: $dataset" }
}
```

Outputs:

```text
geoclip/results/
geoclip/results-no-location-gui/
```

---

## SALAD

For SALAD, the retrieval configuration is made explicit in both image variants:

```text
index   = ivfflat
nprobe  = 64
top-k   = 5
```

Commands:

```powershell
foreach ($dataset in $datasets) {
    .\salad\.venv\Scripts\python.exe .\salad\salad_batch_eval.py `
        --dataset $dataset `
        --index ivfflat `
        --nprobe 64 `
        --top-k 5 `
        --images-root .\demo_and_extension\data\starting-images `
        --output-dir .\salad\results

    if ($LASTEXITCODE -ne 0) { throw "SALAD original failed: $dataset" }

    .\salad\.venv\Scripts\python.exe .\salad\salad_batch_eval.py `
        --dataset $dataset `
        --index ivfflat `
        --nprobe 64 `
        --top-k 5 `
        --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
        --output-dir .\salad\results-no-location-gui

    if ($LASTEXITCODE -ne 0) { throw "SALAD no-GUI failed: $dataset" }
}
```

Outputs:

```text
salad/results/
salad/results-no-location-gui/
```

---

## PLONK

PLONK uses the same evaluator in both image variants. The maintained evaluator uses the same fixed model/checkpoint and deterministic inference settings for both runs.

```powershell
foreach ($dataset in $datasets) {
    .\plonk\.venv\Scripts\python.exe .\plonk\plonk_batch_eval.py `
        --dataset $dataset `
        --images-root .\demo_and_extension\data\starting-images `
        --output-dir .\plonk\results

    if ($LASTEXITCODE -ne 0) { throw "PLONK original failed: $dataset" }

    .\plonk\.venv\Scripts\python.exe .\plonk\plonk_batch_eval.py `
        --dataset $dataset `
        --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
        --output-dir .\plonk\results-no-location-gui

    if ($LASTEXITCODE -ne 0) { throw "PLONK no-GUI failed: $dataset" }
}
```

Fixed evaluator settings include:

```text
checkpoint        = nicolas-dufour/PLONK_OSV_5M
device            = CPU
base seed         = 42
samples per image = 1
```

Outputs:

```text
plonk/results/
plonk/results-no-location-gui/
```

---

## Chipoint v2

Chipoint v2 uses the same public three-tower fused-retrieval configuration for both static image variants.

```powershell
foreach ($dataset in $datasets) {
    .\chipointv2\.venv\Scripts\python.exe .\chipointv2\chipointv2_local_batch_eval.py `
        --dataset $dataset `
        --images-root .\demo_and_extension\data\starting-images `
        --output-dir .\chipointv2\results

    if ($LASTEXITCODE -ne 0) { throw "Chipoint original failed: $dataset" }

    .\chipointv2\.venv\Scripts\python.exe .\chipointv2\chipointv2_local_batch_eval.py `
        --dataset $dataset `
        --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
        --output-dir .\chipointv2\results-no-location-gui

    if ($LASTEXITCODE -ne 0) { throw "Chipoint no-GUI failed: $dataset" }
}
```

Fixed retrieval settings:

```text
prediction Top-K  = 10
pool per tower    = 200
fused pool        = 64
gallery chunk     = 500,000 rows
reranker          = off
```

Outputs:

```text
chipointv2/results/
chipointv2/results-no-location-gui/
```

### Query-embedding cache separation

Chipoint v2 caches query embeddings because encoding the three image towers is expensive.

Example:

```text
Original OpenGuessr:
europe-easy_so400m256_queries.npy

No-location-GUI:
europe-easy_no-location-gui_so400m256_queries.npy
```

To force a completely fresh query-encoding run, the derived query-embedding caches can optionally be removed before rerunning:

```powershell
Remove-Item .\chipointv2\.cache\query_embeddings\europe-*_queries.npy
```

This does not remove the large downloaded model or gallery assets.

### Windows safetensors loading

On Windows, the evaluator uses the safetensors `pread` backend to avoid a native access-violation crash when loading the large GOPT checkpoint.

This changes only how the checkpoint bytes are read from disk. It does **not** change the model weights, preprocessing, embeddings, or inference configuration.

---

## Comparing the two static image variants

After both variants have been evaluated for all four baselines, run:

```powershell
python .\demo_and_extension\scripts\compare_static_baseline_conditions.py
```

The comparison script pairs predictions by `location_id` and compares the same 25 benchmark locations between the original and no-location-GUI static image variants.

Output is written to:

```text
demo_and_extension/analysis/static-baseline-no-gui-comparison/
```

Generated files include:

```text
comparison_report.md
overall_comparison.csv
comparison_by_split.csv
paired_location_differences.csv
```

If `matplotlib` is installed, the script also creates:

```text
mean_error_comparison.png
paired_error_deltas.png
```

## Comparison convention

The paired geodesic-error change is defined as:

```text
delta_km = no_location_gui_error_km - original_error_km
```

Therefore:

```text
negative delta  -> no-location-GUI performed better
positive delta  -> original OpenGuessr image performed better
zero delta      -> no change
```

## Statistical comparison

The comparison script reports:

- original and no-location-GUI mean geodesic error;
- median geodesic error;
- paired mean and median error change;
- number of locations that improved or worsened;
- bootstrap 95% confidence interval for the mean paired change;
- two-sided paired sign-flip permutation test;
- Holm-adjusted p-values across the overall model comparisons;
- threshold accuracies at the benchmark distance thresholds.

The Easy, Medium, and Hard splits are also summarized separately.

Because the benchmark contains only 25 fixed locations, the statistical results are used to describe the stability of the observed benchmark effect rather than to claim population-wide significance.

## Reproducibility rationale

For each model, both static image variants are rerun using the same current evaluator implementation.

The intended differences between each paired run are:

```text
input image root
output result directory
```

For Chipoint v2, the query-cache namespace also differs intentionally so that cached embeddings from one static image variant cannot accidentally be reused for another.

All model, checkpoint, retrieval, sampling, and evaluation settings are otherwise kept unchanged.

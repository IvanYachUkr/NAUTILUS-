# Chipoint v2 Local Batch Evaluation

This folder contains the Chipoint v2 static-image baseline used for the project benchmark.

The evaluator runs the public Chipoint v2 **street-view fused-retrieval pipeline locally** using the official precomputed OSV-5M galleries.

Ground-truth coordinates are derived from each location's `google_maps_link` in the competition files, so latitude/longitude are not maintained separately.

## Pipeline

```text
benchmark image
      ↓
three query encoders
      ├─ SigLIP2 SO400M
      ├─ GOPT
      └─ DINOv3 ViT-L
      ↓
top-200 retrievals per tower
      ↓
z-score fusion
      ↓
top-64 fused candidate pool
      ↓
cluster-consensus prediction
      ↓
latitude / longitude
```

The unpublished 23-feature reranker is **not used**.

## Setup

Chipoint v2 is tested with **Python 3.10**.

Create and activate a virtual environment inside the `chipointv2` folder:

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\activate
```

Install CUDA-enabled PyTorch:

```powershell
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
```

Install the remaining dependencies:

```powershell
python -m pip install -r requirements.txt
```

The local evaluator requires CUDA.

Required model weights and gallery files are downloaded automatically on first use and cached locally.

## Run evaluation

With the virtual environment activated and from the `chipointv2` folder:

### Easy - default

```powershell
python chipointv2_local_batch_eval.py
```

Equivalent to:

```powershell
python chipointv2_local_batch_eval.py --dataset europe-easy
```

### Medium

```powershell
python chipointv2_local_batch_eval.py --dataset europe-medium
```

### Hard

```powershell
python chipointv2_local_batch_eval.py --dataset europe-hard
```

By default, the evaluator reads images from:

```text
demo_and_extension/data/starting-images/<dataset>/
```

## Alternative image roots

The default benchmark image location remains unchanged.

Alternative static-image variants can be evaluated with `--images-root`. The supplied directory must contain the benchmark split folders:

```text
<images-root>/
├── europe-easy/
├── europe-medium/
└── europe-hard/
```

If `--images-root` is omitted, the original `demo_and_extension/data/starting-images/` directory is used.

### No-location-GUI evaluation

The GUI-reduced benchmark images are stored under:

```text
demo_and_extension/data/starting-images-no-gui-crop/no-location-gui/
```

From the repository root, evaluate the three splits with:

```powershell
.\chipointv2\.venv\Scripts\python.exe .\chipointv2\chipointv2_local_batch_eval.py `
    --dataset europe-easy `
    --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
    --output-dir .\chipointv2\results-no-location-gui
```

```powershell
.\chipointv2\.venv\Scripts\python.exe .\chipointv2\chipointv2_local_batch_eval.py `
    --dataset europe-medium `
    --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
    --output-dir .\chipointv2\results-no-location-gui
```

```powershell
.\chipointv2\.venv\Scripts\python.exe .\chipointv2\chipointv2_local_batch_eval.py `
    --dataset europe-hard `
    --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
    --output-dir .\chipointv2\results-no-location-gui
```

Using `--images-root` changes only the query-image source. The competition definitions, model towers, gallery, fusion settings, and evaluation metrics remain unchanged.

Using a separate `--output-dir` prevents the alternative-condition results from overwriting the standard baseline results.

## Query-embedding cache

Query embeddings are cached locally because encoding the three towers is expensive.

For the standard benchmark, cache files use names such as:

```text
.cache/query_embeddings/europe-easy_so400m256_queries.npy
.cache/query_embeddings/europe-easy_gopt_queries.npy
.cache/query_embeddings/europe-easy_dinov3_queries.npy
```

Alternative image roots use a separate cache namespace derived from the image-root name. For the `no-location-gui` condition, examples are:

```text
.cache/query_embeddings/europe-easy_no-location-gui_so400m256_queries.npy
.cache/query_embeddings/europe-easy_no-location-gui_gopt_queries.npy
.cache/query_embeddings/europe-easy_no-location-gui_dinov3_queries.npy
```

This prevents embeddings generated from the original OpenGuessr images from being reused for a different image condition.

Existing compatible cache files are reused automatically.

## Windows safetensors workaround

On Windows, loading the large GOPT safetensors checkpoint with the default memory-mapped backend can cause a native access-violation crash.

The evaluator therefore uses the safetensors `pread` backend on Windows when loading large OpenCLIP checkpoints.

This changes only how the checkpoint bytes are read from disk. It does **not** change the model weights, preprocessing, embeddings, or evaluation configuration.

When enabled, the script prints:

```text
Windows safetensors workaround enabled: backend=pread
```

## Fixed retrieval configuration

The maintained local public-pipeline configuration uses:

```text
prediction Top-K = 10
retrieval pool per tower = 200
fused candidate pool = 64
gallery chunk rows = 500,000
reranker = off
```

These settings should remain unchanged when comparing image conditions so that the input image is the only experimental variable.

## Expected input layout

```text
repo/
├── chipointv2/
│   ├── .venv/
│   ├── chipointv2_local_batch_eval.py
│   ├── requirements.txt
│   ├── results/
│   └── results-no-location-gui/
│
└── demo_and_extension/
    └── data/
        ├── competitions/
        │   ├── europe-easy.json
        │   ├── europe-medium.json
        │   └── europe-hard.json
        │
        ├── starting-images/
        │   ├── europe-easy/
        │   ├── europe-medium/
        │   └── europe-hard/
        │
        └── starting-images-no-gui-crop/
            └── no-location-gui/
                ├── europe-easy/
                ├── europe-medium/
                └── europe-hard/
```

## Output

Standard results are written by default to:

```text
chipointv2/results/
```

For each dataset the evaluator creates:

```text
chipointv2_local_static_<dataset>.csv
chipointv2_local_static_<dataset>_details.json
chipointv2_local_static_<dataset>_summary.json
```

For the no-location-GUI experiment used above, results are written to:

```text
chipointv2/results-no-location-gui/
```

The same filename pattern is used there.

The summary contains the same geodesic-error and distance-threshold metrics used for the other benchmark models, together with query-encoding and gallery-retrieval timing information.

## Notes

The implementation uses Chipoint v2's public three-tower fused-retrieval pipeline with cluster consensus.

The unpublished reranker is not used.

When evaluating a new image condition, keep the retrieval configuration unchanged and use a separate `--images-root` and `--output-dir`.

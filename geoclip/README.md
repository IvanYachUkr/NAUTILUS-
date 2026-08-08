# GeoCLIP Batch Evaluation

This folder contains the GeoCLIP static-image baseline used for the project benchmark.

The evaluator reads the same competition definitions and canonical starting images as the main demo. Ground-truth coordinates are derived directly from each location's `google_maps_link`, so latitude/longitude are not maintained separately.

The current implementation runs on **CPU**.

## Setup

Create a virtual environment inside the `geoclip` folder:

```powershell
python -m venv .venv
```

Activate it on Windows:

```powershell
.venv\Scripts\activate
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Hugging Face will use its normal local cache. If you want a custom cache location, set `HF_HOME` yourself before running, for example:

```powershell
$env:HF_HOME = "D:\huggingface_cache"
```

The script does not contain a machine-specific cache path.

## Run evaluation

With the virtual environment activated:

### Easy - default

```powershell
python geoclip_batch_eval.py
```

Equivalent to:

```powershell
python geoclip_batch_eval.py --dataset europe-easy
```

### Medium

```powershell
python geoclip_batch_eval.py --dataset europe-medium
```

### Hard

```powershell
python geoclip_batch_eval.py --dataset europe-hard
```

The script evaluates **all starting images found for the selected dataset** unless `--limit` is supplied.

Optional examples:

```powershell
python geoclip_batch_eval.py --dataset europe-medium --top-k 5
python geoclip_batch_eval.py --dataset europe-easy --limit 5
```

## Expected input layout

```text
repo/
├── geoclip/
│   ├── .venv/
│   ├── geoclip_batch_eval.py
│   └── requirements.txt
└── demo_and_extension/
    └── data/
        ├── competitions/
        │   ├── europe-easy.json
        │   ├── europe-medium.json
        │   └── europe-hard.json
        └── starting-images/
            ├── europe-easy/
            ├── europe-medium/
            └── europe-hard/
```

## Output

Results are written to:

```text
geoclip/results/
```

For each dataset the evaluator creates:

```text
geoclip_static_<dataset>.csv
geoclip_static_<dataset>_details.json
geoclip_static_<dataset>_summary.json
```

The summary includes:

- mean, median, population standard deviation, RMSE, minimum, and maximum top-1 geodesic error;
- top-1 accuracy within 1, 25, 200, 750, and 2500 km;
- best and worst top-1 cases;
- top-k oracle diagnostics;
- model-load and per-image inference timing.

The top-k oracle is diagnostic only and should not be presented as normal top-1 GeoCLIP accuracy.

## Hardware

The evaluator explicitly uses:

```python
device = torch.device("cpu")
```

GPU/CUDA acceleration is not currently enabled.

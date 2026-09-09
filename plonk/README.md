# PLONK Batch Evaluation

This folder contains the PLONK OSV-5M static-image baseline used for the project benchmark.

The evaluator reads the same competition definitions and canonical starting images as the main demo. Ground-truth coordinates are derived directly from each location's `google_maps_link`, so latitude/longitude are not maintained separately.

The implementation uses the pretrained:

```text
nicolas-dufour/PLONK_OSV_5M
```

checkpoint.

For reproducibility, the evaluator uses a fixed random seed and generates exactly one PLONK coordinate prediction per image.

The current tested implementation runs on **CPU**.

## Setup

PLONK is tested with **Python 3.10**.

Create a virtual environment inside the `plonk` folder:

```powershell
py -3.10 -m venv .venv
```

Activate it on Windows:

```powershell
.venv\Scripts\activate
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

## Run evaluation

With the virtual environment activated:

### Easy - default

```powershell
python plonk_batch_eval.py
```

Equivalent to:

```powershell
python plonk_batch_eval.py --dataset europe-easy
```

### Medium

```powershell
python plonk_batch_eval.py --dataset europe-medium
```

### Hard

```powershell
python plonk_batch_eval.py --dataset europe-hard
```

The script evaluates **all starting images found for the selected dataset**.


## Expected input layout

```text
repo/

├── plonk/
│   ├── .venv/
│   ├── plonk_batch_eval.py
│   └── requirements.txt
│
└── demo_and_extension/
    └── data/
        ├── competitions/
        │   ├── europe-easy.json
        │   ├── europe-medium.json
        │   └── europe-hard.json
        │
        └── starting-images/
            ├── europe-easy/
            ├── europe-medium/
            └── europe-hard/
```

## Output

Results are written to:

```text
plonk/results/
```

For each dataset the evaluator creates:

```text
plonk_osv5m_static_<dataset>.csv
plonk_osv5m_static_<dataset>_details.json
plonk_osv5m_static_<dataset>_summary.json
```

The summary includes:

- mean, median, population standard deviation, RMSE, minimum, and maximum geodesic error;
- accuracy within 1, 25, 200, 750, and 2500 km;
- best and worst prediction cases;
- model-load and per-image inference timing.

## Reproducibility

PLONK is a generative geolocation model, so its coordinate prediction depends on random sampling.

For the project benchmark, the evaluator uses:

```text
samples per image = 1
seed = 42
```

This gives every benchmark image one reproducible latitude/longitude prediction and keeps the evaluation directly comparable with the other models.

Other PLONK sampling parameters use the model defaults.

## Hardware

The current tested environment uses CPU inference.

The evaluator can also use CUDA if a compatible PyTorch installation is available.
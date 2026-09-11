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

With the virtual environment activated and from the `plonk` folder:

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

By default, the evaluator reads images from:

```text
demo_and_extension/data/starting-images/<dataset>/
```

The script evaluates **all starting images found for the selected dataset**.

## Alternative image roots

The default benchmark image location remains unchanged. Alternative static-image variants can be evaluated with `--images-root`.

The supplied path must be the directory containing the dataset subfolders, for example:

```text
<images-root>/
├── europe-easy/
├── europe-medium/
└── europe-hard/
```

If `--images-root` is omitted, the original `demo_and_extension/data/starting-images/` directory is used.

### No-location-GUI images

The GUI-reduced benchmark images are stored under:

```text
demo_and_extension/data/starting-images-no-gui-crop/no-location-gui/
```

From the repository root, evaluate the three splits with:

```powershell
.\plonk\.venv\Scripts\python.exe .\plonk\plonk_batch_eval.py `
    --dataset europe-easy `
    --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
    --output-dir .\plonk\results-no-location-gui
```

```powershell
.\plonk\.venv\Scripts\python.exe .\plonk\plonk_batch_eval.py `
    --dataset europe-medium `
    --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
    --output-dir .\plonk\results-no-location-gui
```

```powershell
.\plonk\.venv\Scripts\python.exe .\plonk\plonk_batch_eval.py `
    --dataset europe-hard `
    --images-root .\demo_and_extension\data\starting-images-no-gui-crop\no-location-gui `
    --output-dir .\plonk\results-no-location-gui
```

Using `--images-root` changes only the query-image source. The competition definitions, ground-truth extraction, checkpoint, deterministic sampling configuration, and evaluation metrics remain unchanged.

Using a separate `--output-dir` prevents the alternative-condition results from overwriting the standard baseline results.

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
plonk/results/
```

For each dataset the evaluator creates:

```text
plonk_osv5m_static_<dataset>.csv
plonk_osv5m_static_<dataset>_details.json
plonk_osv5m_static_<dataset>_summary.json
```

Alternative output directories can be selected with `--output-dir`.

For the no-location-GUI experiment used above, results are written to:

```text
plonk/results-no-location-gui/
```

The same filename pattern is used there, for example:

```text
plonk_osv5m_static_europe-easy.csv
plonk_osv5m_static_europe-easy_details.json
plonk_osv5m_static_europe-easy_summary.json
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
base seed = 42
```

A deterministic location-specific seed is derived from the base seed and the location ID. This keeps each benchmark image's prediction reproducible and independent of evaluation order.

Other PLONK sampling parameters use the model defaults.

## Hardware

The current evaluator explicitly uses CPU inference:

```python
device = torch.device("cpu")
```

CUDA/GPU inference is not currently enabled in `plonk_batch_eval.py`.

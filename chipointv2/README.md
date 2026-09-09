# Chipoint v2 Local Batch Evaluation

This folder contains the Chipoint v2 static-image baseline used for the project benchmark.

The evaluator runs the public Chipoint v2 **Street-view fused-retrieval pipeline locally** using the official precomputed OSV-5M galleries. Ground-truth coordinates are read from the competition files.

## Setup

Create and activate a virtual environment:

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

## Run evaluation

### Easy

```powershell
python chipointv2_local_batch_eval.py
```

### Medium

```powershell
python chipointv2_local_batch_eval.py --dataset europe-medium
```

### Hard

```powershell
python chipointv2_local_batch_eval.py --dataset europe-hard
```

Required model weights and gallery files are downloaded automatically and cached locally.

## Output

Results are written to:

```text
chipointv2/results/
```

For each dataset:

```text
chipointv2_local_static_<dataset>.csv
chipointv2_local_static_<dataset>_details.json
chipointv2_local_static_<dataset>_summary.json
```

The summary contains the same geodesic-error and distance-threshold metrics used for the other benchmark models.

## Note

The implementation uses Chipoint v2's public three-tower fused-retrieval pipeline with cluster consensus. The unpublished reranker is not used.

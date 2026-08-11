# SALAD + OSV-5M Europe (FP32 + IVF-Flat retrieval)

This folder contains the reproducible SALAD pipeline used to geolocate the
project's static OpenGuessr images with an OSV-5M Europe reference database.

The maintained workflow keeps the **full float32 SALAD descriptors**.
Compression experiments (SQfp16/SQ8/SQ4/PQ) are no longer part of the normal
pipeline.

There are now two retrieval modes:

- **`fp32`** — exact exhaustive L2 search over all FP32 reference descriptors.
- **`ivfflat`** — practical persistent FAISS `IndexIVFFlat` search. The stored
  vectors remain raw FP32. IVF-Flat does **not** compress them; it accelerates
  search by probing only a subset of coarse clusters.

## Pipeline

```text
OSV-5M Europe images
        ↓
SALAD / DINOv2
        ↓
8448-D float32 reference descriptors
        ↓
        ├─ exact baseline: sharded IndexFlatL2
        │
        └─ practical search: persistent IVF-Flat
                    ↓
       nearest OSV-5M reference row
                    ↓
      latitude / longitude from reference.csv
```

SALAD's descriptor size is 8192 + 256 = 8448 dimensions. Images are resized to
322 x 322 and normalized with the standard ImageNet/DINOv2 RGB normalization
used by the model.

## Files to keep

Core reproducibility scripts:

```text
prepare_osv5m_europe.py
build_salad_reference_embeddings.py
build_salad_ivfflat_index.py
salad_batch_eval.py
requirements_extra.txt
README.md
```

Also useful:

```text
embed_openguessr_queries.py
smoke_test.ps1
run_overnight.ps1
```

`embed_openguessr_queries.py` is optional for normal evaluation because
`salad_batch_eval.py` embeds the static query images itself.

## Important generated data

### FP32 reference master

```text
osv-5m_europe/salad_embeddings_fp32/
├─ embeddings_00000.npy
├─ embeddings_00000.json
├─ ...
├─ reference.csv
└─ master_info.json
```

Do **not** delete this directory if you want exact FP32 retrieval or want to
rebuild the IVF index.

### Persistent IVF-Flat index

After building the practical search index:

```text
osv-5m_europe/salad_ivfflat/
├─ trained_ivfflat.faiss
├─ index.faiss
├─ index.ivfdata
└─ index_info.json
```

`index.faiss` and `index.ivfdata` belong together. `index.ivfdata` contains the
large on-disk inverted lists with the raw FP32 descriptors.

## Installation

Activate `salad/.venv` and install the additional dependencies:

```powershell
python -m pip install -r .\requirements_extra.txt
```

Keep the existing CUDA-enabled PyTorch installation.

## Stage 1 - Prepare OSV-5M Europe

Only needed when reproducing the dataset from scratch:

```powershell
python .\prepare_osv5m_europe.py --mode download
python .\prepare_osv5m_europe.py --mode extract
```

Expected outputs:

```text
osv-5m_europe/
├─ metadata/europe.csv
├─ images/train/
├─ images/test/
└─ state/
```

Downloaded ZIP files are not required after successful extraction.

## Stage 2 - Build the FP32 SALAD reference master

```powershell
python .\build_salad_reference_embeddings.py `
  --device cuda `
  --batch-size 64 `
  --workers 1
```

On the current Windows + HDD + GTX 1070 machine, batch size 64 and one worker
were the best tested settings.

The build is resumable and intentionally stores float32 descriptors without
autocast.

## Stage 3 - Build the persistent IVF-Flat index

Run this **once** after the FP32 master exists:

```powershell
python .\build_salad_ivfflat_index.py `
  --nlist 1024 `
  --train-sample 40000
```

The builder:

1. samples FP32 descriptors,
2. trains one global IVF coarse partition,
3. creates resumable temporary IVF indexes from the existing FP32 shards,
4. merges them into FAISS on-disk inverted lists,
5. writes the reusable final index,
6. deletes temporary shard indexes after a successful merge.

The default 40,000-vector training sample uses about 1.26 GiB of raw float32
memory. Closing memory-heavy programs before IVF training is recommended.

### Disk-space requirement

IVF-Flat does not compress the database. The final `index.ivfdata` is therefore
roughly the same order of size as the FP32 master.

During the official temporary-shard + merge build, temporary IVF shard indexes
and the final IVF data coexist. Plan for roughly **two additional
FP32-database-sized copies** during the build.

After a successful merge the temporary shard indexes are deleted automatically.

## Stage 4 - Batch-evaluate static images

The evaluator first embeds **all query images** in the selected dataset and then
searches their descriptors together.

### Recommended practical mode

```powershell
python .\salad_batch_eval.py `
  --dataset europe-easy `
  --index ivfflat `
  --nprobe 32 `
  --top-k 5
```

Likewise:

```powershell
python .\salad_batch_eval.py `
  --dataset europe-medium `
  --index ivfflat `
  --nprobe 32 `
  --top-k 5
```

```powershell
python .\salad_batch_eval.py `
  --dataset europe-hard `
  --index ivfflat `
  --nprobe 32 `
  --top-k 5
```

### What `nprobe` means

`nprobe` is the main IVF speed/recall setting:

```text
smaller nprobe → fewer coarse lists → faster, potentially lower recall
larger nprobe  → more coarse lists  → slower, closer to exact FP32
```

Start with:

```text
nprobe = 32
```

Useful comparison values are:

```text
16, 32, 64, 128
```

### Exact FP32 baseline

Use:

```powershell
python .\salad_batch_eval.py `
  --dataset europe-easy `
  --index fp32 `
  --top-k 5
```

This is mathematically exact but must examine all ~2.17M reference descriptors.

The evaluator is batched, so all query images are searched together and the
FP32 reference shards are scanned only once per evaluator run.

## Validate IVF-Flat once

IVF-Flat keeps the original descriptor values but performs approximate
candidate selection. It is therefore useful to compare it against exact FP32
on the existing easy set once.

Exact:

```powershell
python .\salad_batch_eval.py `
  --dataset europe-easy `
  --index fp32 `
  --top-k 5
```

Practical:

```powershell
python .\salad_batch_eval.py `
  --dataset europe-easy `
  --index ivfflat `
  --nprobe 32 `
  --top-k 5
```

If the IVF results differ more than desired, try:

```powershell
--nprobe 64
```

or:

```powershell
--nprobe 128
```

This is an indexing/search tradeoff, not descriptor compression.

## Input data

```text
../demo_and_extension/data/competitions/<dataset>.json
../demo_and_extension/data/starting-images/<dataset>/
```

Ground-truth coordinates are extracted from each Google Maps link in the
competition JSON.

## Results

Results are written under:

```text
results/
```

IVF result names include the probe count:

```text
salad_ivfflat_nprobe32_europe-easy.csv
salad_ivfflat_nprobe32_europe-easy_details.json
salad_ivfflat_nprobe32_europe-easy_summary.json
```

Exact results use names such as:

```text
salad_fp32_europe-easy.csv
```

## Optional cached query descriptors

Not required for `salad_batch_eval.py`:

```powershell
python .\embed_openguessr_queries.py --device cuda
```

## What can be deleted

Safe to delete when not needed:

```text
salad_compression_benchmark/
query_embeddings/
_smoke/
logs/
osv-5m_zips/
```

After the FP32 master has been verified, the extracted source images are
optional for normal runtime:

```text
osv-5m_europe/images/
```

Deleting them means regenerating the FP32 master later would require
redownloading/extracting OSV-5M.

Do not delete:

```text
osv-5m_europe/salad_embeddings_fp32/
```

if you want exact FP32 retrieval or IVF rebuilding.

Do not delete:

```text
osv-5m_europe/salad_ivfflat/
```

if you want fast IVF-Flat querying.

## Reproduction levels

### Minimal practical runtime

Keep:

```text
salad_batch_eval.py
requirements_extra.txt
osv-5m_europe/salad_embeddings_fp32/reference.csv
osv-5m_europe/salad_ivfflat/
```

The full `embeddings_*.npy` shards are not needed merely to query an already
built IVF index.

### Exact + practical runtime

Keep:

```text
salad_batch_eval.py
osv-5m_europe/salad_embeddings_fp32/
osv-5m_europe/salad_ivfflat/
```

### Full reproducibility

Keep all scripts plus:

```text
osv-5m_europe/metadata/
osv-5m_europe/images/
osv-5m_europe/salad_embeddings_fp32/
osv-5m_europe/salad_ivfflat/
```

# SALAD embedding + compression benchmark toolchain

This folder contains the scripts to run after the OSV-5M Europe images have
finished extracting.

## Why this is split into stages

SALAD inference over ~2.17M reference images is the expensive operation.
The correct workflow is:

1. Compute the full 8448-D float32 SALAD descriptors exactly once.
2. Keep those float32 shards as the permanent master.
3. Compute the OpenGuessr query descriptors once.
4. Derive and benchmark compressed FAISS representations from the master.

The official SALAD repository lists the main `dino_salad` descriptor as
`8192 + 256 = 8448` dimensions and evaluates at 322 x 322 pixels.

## Install

Activate the existing `salad/.venv`, then install the extra dependencies:

```powershell
python -m pip install -U numpy pandas pillow tqdm torchvision
python -m pip install faiss-cpu
```

Your CUDA-enabled PyTorch installation should remain the PyTorch installation
you already configured. Do not replace it with a CPU-only torch package.

## Stage 1 - float32 reference master

From `repo/salad/`:

```powershell
python .\build_salad_reference_embeddings.py --device cuda --batch-size 8 --workers 4
```

If VRAM allows, try a larger batch:

```powershell
python .\build_salad_reference_embeddings.py --device cuda --batch-size 16 --workers 4
```

If CUDA runs out of memory, lower `--batch-size`.

The output is:

```text
osv-5m_europe/salad_embeddings_fp32/
├─ embeddings_00000.npy
├─ embeddings_00000.json
├─ embeddings_00001.npy
├─ embeddings_00001.json
├─ ...
├─ reference.csv
└─ master_info.json
```

Every `.npy` is float32. The script intentionally does NOT use CUDA autocast,
because these files are the accuracy baseline.

It is resumable. A completed shard is validated and skipped on rerun.

## Stage 2 - OpenGuessr query descriptors

```powershell
python .\embed_openguessr_queries.py --device cuda
```

Defaults target the existing sibling project:

```text
../demo_and_extension/data/competitions/europe-easy.json
../demo_and_extension/data/starting-images/europe-easy/
```

Output:

```text
query_embeddings/europe-easy/
├─ queries.npy
└─ queries.csv
```

## Stage 3 - benchmark compression

Start with the scalar quantizers:

```powershell
python .\benchmark_salad_compression.py --methods sqfp16 sq8 sq4
```

Then test PQ:

```powershell
python .\benchmark_salad_compression.py --methods pq256 pq128 pq64
```

Or run them together:

```powershell
python .\benchmark_salad_compression.py
```

The float32 baseline is searched exactly, one embedding shard at a time, with
`IndexFlatL2`. Therefore the full ~68 GiB master does not have to fit in RAM.

Compressed indexes are cached in:

```text
salad_compression_benchmark/
```

The main result is:

```text
salad_compression_benchmark/benchmark_results.csv
```

Important columns:

- `size_gib`
- `compression_vs_fp32`
- `same_top1`
- `recall_at_10`
- `geo_mean_km`
- `geo_median_km`
- `within_1km`
- `within_25km`
- `within_200km`
- `within_750km`
- `within_2500km`
- `ms_per_query`

## Interpretation

`fp32_exact_sharded` is the reference.

For each compressed representation, ask:

1. How much smaller is it?
2. How often does Top-1 stay identical?
3. How many exact Top-K neighbors are retained?
4. Does OpenGuessr geolocation accuracy actually change?
5. How much faster/slower is retrieval?

This separates *representation compression* from approximate search.

Do not add IVF/HNSW to this first benchmark. IVF/HNSW would introduce another
variable: approximate candidate search. Once the best compressed representation
is known, a second experiment can evaluate IVF/HNSW separately.


## Smoke test before a long run

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\smoke_test.ps1
```

It performs:
- CUDA/import validation
- 32 reference embeddings in two tiny shards
- up to 3 OpenGuessr query embeddings
- exact retrieval
- SQfp16 and SQ8 compression/retrieval

All smoke outputs go under `_smoke/` and do not collide with the full run.

## Overnight runner

After the OSV-5M Europe extraction is complete:

```powershell
powershell -ExecutionPolicy Bypass -File .\run_overnight.ps1
```

This:
1. runs the smoke test and stops immediately if anything fails,
2. builds the full resumable float32 master,
3. embeds the OpenGuessr queries,
4. benchmarks SQfp16, SQ8, and SQ4,
5. writes a timestamped log under `logs/`.

The reference embedding stage is resumable, so an interrupted overnight run
does not throw away completed embedding shards.

PQ is intentionally left out of the first unattended overnight run. PQ
training/index creation is more demanding and should be launched after the
scalar-quantization benchmark has been validated.

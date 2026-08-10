#!/usr/bin/env python3
"""
Benchmark SALAD reference compression against exact float32 exhaustive retrieval.

Baseline:
  - Exact sharded IndexFlatL2 over the float32 master.
  - This avoids loading ~68 GiB of reference vectors at once.

Compression methods:
  - SQfp16
  - SQ8
  - SQ4
  - PQ64, PQ128, PQ256

Metrics:
  - same Top-1 vs exact float32
  - exact-neighbor Recall@K
  - geodesic Top-1 error
  - threshold accuracy (1/25/200/750/2500 km)
  - index size
  - build time
  - query latency

Compressed FAISS indexes are built once and cached on disk.

NOTE:
  Quantized exhaustive indexes still examine the whole database, but their
  vector representation is lossy. IVF/HNSW are intentionally NOT included
  here because they mix compression loss with approximate-search loss.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import random
import time
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import faiss
except ImportError as exc:
    raise SystemExit(
        "faiss is required. Install faiss-cpu (or a suitable FAISS build) first."
    ) from exc

DESCRIPTOR_DIM = 8448
THRESHOLDS_KM = (1, 25, 200, 750, 2500)


def parse_args() -> argparse.Namespace:
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser()
    p.add_argument(
        "--master",
        type=Path,
        default=here / "osv-5m_europe" / "salad_embeddings_fp32",
    )
    p.add_argument(
        "--queries",
        type=Path,
        default=here / "query_embeddings" / "europe-easy",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=here / "salad_compression_benchmark",
    )
    p.add_argument(
        "--methods",
        nargs="+",
        default=["sqfp16", "sq8", "sq4", "pq256", "pq128", "pq64"],
        choices=["sqfp16", "sq8", "sq4", "pq256", "pq128", "pq64"],
    )
    p.add_argument("--top-k", type=int, default=10)
    p.add_argument(
        "--train-sample",
        type=int,
        default=100_000,
        help="Maximum float32 reference vectors sampled to train quantizers.",
    )
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--rebuild",
        action="store_true",
        help="Rebuild compressed indexes even when cached index files exist.",
    )
    p.add_argument(
        "--max-reference",
        type=int,
        default=None,
        help=(
            "Benchmark at most N reference vectors from the beginning of the master. "
            "Useful for smoke tests."
        ),
    )
    p.add_argument(
        "--max-queries",
        type=int,
        default=None,
        help="Benchmark at most N query descriptors. Useful for smoke tests.",
    )
    return p.parse_args()



def make_limited_master_shards(
    shards: list[Path],
    output: Path,
    max_reference: int | None,
) -> tuple[list[Path], int]:
    """
    For smoke tests, materialize a small prefix of the float32 master into a
    dedicated temporary shard plus matching JSON metadata.

    Full runs simply return the original shards.
    """
    if max_reference is None:
        total = sum(np.load(s, mmap_mode="r").shape[0] for s in shards)
        return shards, total

    if max_reference <= 0:
        raise ValueError("--max-reference must be > 0")

    smoke_dir = output / "_smoke_master"
    smoke_dir.mkdir(parents=True, exist_ok=True)
    smoke_npy = smoke_dir / "embeddings_00000.npy"
    smoke_json = smoke_dir / "embeddings_00000.json"

    pieces = []
    remaining = max_reference
    for shard in shards:
        arr = np.load(shard, mmap_mode="r")
        take = min(remaining, len(arr))
        if take > 0:
            pieces.append(np.asarray(arr[:take], dtype=np.float32))
            remaining -= take
        if remaining <= 0:
            break

    if not pieces:
        raise RuntimeError("No reference embeddings available for smoke benchmark.")

    limited = np.concatenate(pieces, axis=0)
    np.save(smoke_npy, limited, allow_pickle=False)
    smoke_json.write_text(
        json.dumps(
            {
                "complete": True,
                "shard_index": 0,
                "row_start": 0,
                "row_end_exclusive": len(limited),
                "rows": len(limited),
                "descriptor_dim": limited.shape[1],
                "dtype": "float32",
                "failed_rows": 0,
                "file": smoke_npy.name,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[test limit] Restricted benchmark reference DB to {len(limited):,} vectors.")
    return [smoke_npy], len(limited)

def embedding_shards(master: Path) -> list[Path]:
    shards = sorted(master.glob("embeddings_*.npy"))
    if not shards:
        raise FileNotFoundError(f"No embeddings_*.npy found in {master}")
    return shards


def shard_row_start(npy_path: Path) -> int:
    meta = npy_path.with_suffix(".json")
    if not meta.exists():
        raise FileNotFoundError(meta)
    info = json.loads(meta.read_text(encoding="utf-8"))
    return int(info["row_start"])


def merge_topk(
    best_d: np.ndarray,
    best_i: np.ndarray,
    new_d: np.ndarray,
    new_i: np.ndarray,
    k: int,
) -> tuple[np.ndarray, np.ndarray]:
    d = np.concatenate([best_d, new_d], axis=1)
    i = np.concatenate([best_i, new_i], axis=1)
    order = np.argpartition(d, kth=k - 1, axis=1)[:, :k]
    row = np.arange(d.shape[0])[:, None]
    d2 = d[row, order]
    i2 = i[row, order]
    sort_order = np.argsort(d2, axis=1)
    return d2[row, sort_order], i2[row, sort_order]


def exact_sharded_search(
    shards: list[Path],
    queries: np.ndarray,
    k: int,
) -> tuple[np.ndarray, np.ndarray, float]:
    nq = len(queries)
    best_d = np.full((nq, k), np.inf, dtype=np.float32)
    best_i = np.full((nq, k), -1, dtype=np.int64)

    started = time.perf_counter()
    for shard in shards:
        x = np.load(shard, mmap_mode="r")
        if np.isnan(x).any():
            raise RuntimeError(f"NaNs found in master shard: {shard}")
        x = np.asarray(x, dtype=np.float32)

        index = faiss.IndexFlatL2(x.shape[1])
        index.add(x)
        d, i = index.search(queries, k)
        i = i.astype(np.int64) + shard_row_start(shard)
        best_d, best_i = merge_topk(best_d, best_i, d, i, k)
        del index, x

    elapsed = time.perf_counter() - started
    return best_d, best_i, elapsed


def reservoir_training_sample(
    shards: list[Path],
    sample_size: int,
    seed: int,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    # Proportional per-shard sampling is simple and sufficiently unbiased here.
    counts = [np.load(s, mmap_mode="r").shape[0] for s in shards]
    total = sum(counts)
    chunks = []
    remaining = sample_size

    for pos, (shard, count) in enumerate(zip(shards, counts)):
        if pos == len(shards) - 1:
            take = min(remaining, count)
        else:
            take = min(count, round(sample_size * count / total))
            take = min(take, remaining)
        if take <= 0:
            continue
        arr = np.load(shard, mmap_mode="r")
        ids = rng.choice(count, size=take, replace=False)
        chunks.append(np.asarray(arr[ids], dtype=np.float32))
        remaining -= take
        if remaining <= 0:
            break

    sample = np.concatenate(chunks, axis=0)
    if len(sample) > sample_size:
        sample = sample[:sample_size]
    return sample


def make_index(method: str, d: int):
    if method == "sqfp16":
        return faiss.IndexScalarQuantizer(
            d, faiss.ScalarQuantizer.QT_fp16, faiss.METRIC_L2
        )
    if method == "sq8":
        return faiss.IndexScalarQuantizer(
            d, faiss.ScalarQuantizer.QT_8bit, faiss.METRIC_L2
        )
    if method == "sq4":
        return faiss.IndexScalarQuantizer(
            d, faiss.ScalarQuantizer.QT_4bit, faiss.METRIC_L2
        )
    if method.startswith("pq"):
        m = int(method[2:])
        if d % m != 0:
            raise ValueError(f"d={d} is not divisible by PQ M={m}")
        return faiss.IndexPQ(d, m, 8, faiss.METRIC_L2)
    raise ValueError(method)


def build_or_load_index(
    method: str,
    shards: list[Path],
    out_dir: Path,
    train_sample_size: int,
    seed: int,
    rebuild: bool,
):
    index_path = out_dir / f"{method}.faiss"
    info_path = out_dir / f"{method}.json"

    if index_path.exists() and info_path.exists() and not rebuild:
        info = json.loads(info_path.read_text(encoding="utf-8"))
        index = faiss.read_index(str(index_path))
        return index, info

    index = make_index(method, DESCRIPTOR_DIM)
    started = time.perf_counter()

    if not index.is_trained:
        print(f"[{method}] sampling up to {train_sample_size:,} vectors for training ...")
        sample = reservoir_training_sample(shards, train_sample_size, seed)
        print(f"[{method}] training on {len(sample):,} vectors ...")
        index.train(sample)
        del sample

    print(f"[{method}] adding reference shards ...")
    total = 0
    for shard in shards:
        x = np.load(shard, mmap_mode="r")
        if np.isnan(x).any():
            raise RuntimeError(f"NaNs found in {shard}")
        block = np.asarray(x, dtype=np.float32)
        index.add(block)
        total += len(block)

    build_seconds = time.perf_counter() - started
    faiss.write_index(index, str(index_path))
    size_bytes = index_path.stat().st_size

    info = {
        "method": method,
        "ntotal": int(index.ntotal),
        "dimension": DESCRIPTOR_DIM,
        "build_seconds": build_seconds,
        "index_size_bytes": size_bytes,
        "train_sample": train_sample_size,
    }
    info_path.write_text(json.dumps(info, indent=2), encoding="utf-8")
    return index, info


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1 = np.radians(lat1)
    p2 = np.radians(lat2)
    dp = np.radians(lat2 - lat1)
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def recall_at_k(baseline_i: np.ndarray, candidate_i: np.ndarray, k: int) -> float:
    vals = []
    for a, b in zip(baseline_i[:, :k], candidate_i[:, :k]):
        vals.append(len(set(map(int, a)) & set(map(int, b))) / k)
    return float(np.mean(vals))


def geo_metrics(
    retrieved_i: np.ndarray,
    reference: pd.DataFrame,
    queries_meta: pd.DataFrame,
) -> dict:
    top1 = retrieved_i[:, 0]
    ref_lat = reference["latitude"].to_numpy(dtype=float)[top1]
    ref_lon = reference["longitude"].to_numpy(dtype=float)[top1]
    gt_lat = queries_meta["gt_latitude"].to_numpy(dtype=float)
    gt_lon = queries_meta["gt_longitude"].to_numpy(dtype=float)
    errors = haversine_km(gt_lat, gt_lon, ref_lat, ref_lon)

    out = {
        "geo_mean_km": float(np.mean(errors)),
        "geo_median_km": float(np.median(errors)),
    }
    for t in THRESHOLDS_KM:
        out[f"within_{t}km"] = float(np.mean(errors <= t))
    return out


def main() -> None:
    args = parse_args()
    master = args.master.expanduser().resolve()
    queries_dir = args.queries.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if args.max_reference is not None or args.max_queries is not None:
        output = output / "_smoke"
    output.mkdir(parents=True, exist_ok=True)

    original_shards = embedding_shards(master)
    shards, reference_limit = make_limited_master_shards(
        original_shards, output, args.max_reference
    )

    reference = pd.read_csv(
        master / "reference.csv",
        usecols=["row_id", "id", "split", "latitude", "longitude"],
        low_memory=False,
    ).sort_values("row_id").reset_index(drop=True)

    if args.max_reference is not None:
        reference = reference.iloc[:reference_limit].copy().reset_index(drop=True)

    queries = np.load(queries_dir / "queries.npy").astype(np.float32, copy=False)
    queries_meta = pd.read_csv(queries_dir / "queries.csv")

    if args.max_queries is not None:
        if args.max_queries <= 0:
            raise ValueError("--max-queries must be > 0")
        queries = queries[:args.max_queries]
        queries_meta = queries_meta.iloc[:args.max_queries].copy().reset_index(drop=True)
        print(f"[test limit] Restricted benchmark to {len(queries)} query descriptor(s).")

    if queries.shape[1] != DESCRIPTOR_DIM:
        raise RuntimeError(f"Unexpected query dimension: {queries.shape}")
    if len(queries) != len(queries_meta):
        raise RuntimeError("queries.npy and queries.csv row count mismatch")

    baseline_npz = output / f"exact_fp32_top{args.top_k}.npz"
    baseline_info_json = output / f"exact_fp32_top{args.top_k}.json"

    if baseline_npz.exists() and baseline_info_json.exists() and not args.rebuild:
        saved = np.load(baseline_npz)
        base_d = saved["distances"]
        base_i = saved["indices"]
        base_info = json.loads(baseline_info_json.read_text(encoding="utf-8"))
        print("[baseline] reusing cached exact float32 results")
    else:
        print("[baseline] exact sharded float32 IndexFlatL2 search ...")
        base_d, base_i, base_seconds = exact_sharded_search(
            shards, queries, args.top_k
        )
        np.savez_compressed(
            baseline_npz,
            distances=base_d,
            indices=base_i,
        )
        base_info = {
            "method": "fp32_exact_sharded",
            "query_seconds": base_seconds,
            "query_count": len(queries),
            "top_k": args.top_k,
            "reference_count": len(reference),
        }
        baseline_info_json.write_text(json.dumps(base_info, indent=2), encoding="utf-8")

    rows = []
    baseline_geo = geo_metrics(base_i, reference, queries_meta)
    master_payload_bytes = sum(np.load(s, mmap_mode="r").nbytes for s in shards)

    rows.append(
        {
            "method": "fp32_exact_sharded",
            "index_size_bytes": master_payload_bytes,
            "size_gib": master_payload_bytes / (1024**3),
            "compression_vs_fp32": 1.0,
            "same_top1": 1.0,
            f"recall_at_{args.top_k}": 1.0,
            "query_seconds": float(base_info["query_seconds"]),
            "ms_per_query": 1000 * float(base_info["query_seconds"]) / len(queries),
            **baseline_geo,
        }
    )

    for method in args.methods:
        print(f"\n=== {method} ===")
        index, info = build_or_load_index(
            method=method,
            shards=shards,
            out_dir=output,
            train_sample_size=args.train_sample,
            seed=args.seed,
            rebuild=args.rebuild,
        )

        t0 = time.perf_counter()
        d, i = index.search(queries, args.top_k)
        query_seconds = time.perf_counter() - t0

        same_top1 = float(np.mean(i[:, 0] == base_i[:, 0]))
        rec = recall_at_k(base_i, i, args.top_k)
        geo = geo_metrics(i, reference, queries_meta)
        size_bytes = int(info["index_size_bytes"])

        rows.append(
            {
                "method": method,
                "index_size_bytes": size_bytes,
                "size_gib": size_bytes / (1024**3),
                "compression_vs_fp32": master_payload_bytes / size_bytes,
                "same_top1": same_top1,
                f"recall_at_{args.top_k}": rec,
                "query_seconds": query_seconds,
                "ms_per_query": 1000 * query_seconds / len(queries),
                **geo,
            }
        )

        np.savez_compressed(
            output / f"{method}_top{args.top_k}.npz",
            distances=d,
            indices=i,
        )

    results = pd.DataFrame(rows)
    results.to_csv(output / "benchmark_results.csv", index=False)
    print("\nRESULTS")
    print(results.to_string(index=False))
    print(f"\nSaved: {output / 'benchmark_results.csv'}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
r"""
Batch evaluation for SALAD + OSV-5M retrieval on the project's static images.

This intentionally mirrors geoclip_batch_eval.py, but adds an --index switch.

Examples:
    .\.venv\Scripts\python.exe salad_batch_eval.py --index fp32
    .\.venv\Scripts\python.exe salad_batch_eval.py --index sqfp16
    .\.venv\Scripts\python.exe salad_batch_eval.py --index sq8
    .\.venv\Scripts\python.exe salad_batch_eval.py --index sq4
    .\.venv\Scripts\python.exe salad_batch_eval.py --dataset europe-medium --index sq8
    .\.venv\Scripts\python.exe salad_batch_eval.py --limit 10 --index fp32

Expected layout:

repo/
├─ salad/
│  ├─ .venv/
│  ├─ salad_batch_eval.py
│  ├─ osv-5m_europe/
│  │  └─ salad_embeddings_fp32/
│  │     ├─ embeddings_00000.npy
│  │     ├─ embeddings_00000.json
│  │     ├─ ...
│  │     └─ reference.csv
│  └─ salad_compression_benchmark/
│     ├─ sqfp16.faiss
│     ├─ sq8.faiss
│     ├─ sq4.faiss
│     ├─ pq256.faiss
│     ├─ pq128.faiss
│     └─ pq64.faiss
└─ demo_and_extension/
   └─ data/
      ├─ competitions/europe-easy.json
      └─ starting-images/europe-easy/loc_001.png ...

Notes:
- fp32 = exact exhaustive search over all float32 embedding shards.
- compressed options load the corresponding FAISS index.
- SALAD produces image descriptors. GPS comes from the retrieved OSV-5M
  reference image metadata.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
from geopy.distance import geodesic
from PIL import Image
from torchvision import transforms

try:
    import faiss
except ImportError as exc:
    raise SystemExit(
        "FAISS is required. Activate salad/.venv and install faiss-cpu."
    ) from exc


DISTANCE_THRESHOLDS_KM = (1, 25, 200, 750, 2500)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
DESCRIPTOR_DIM = 8448
IMAGE_SIZE = (322, 322)

INDEX_CHOICES = (
    "fp32",
    "sqfp16",
    "sq8",
    "sq4",
    "pq256",
    "pq128",
    "pq64",
)

GOOGLE_MAPS_COORD_RE = re.compile(
    r"/maps/@(?P<lat>[+-]?(?:\d+(?:\.\d*)?|\.\d+)),"
    r"(?P<lon>[+-]?(?:\d+(?:\.\d*)?|\.\d+))"
)


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    default_demo_root = script_dir.parent / "demo_and_extension"

    parser = argparse.ArgumentParser(
        description="Run SALAD + OSV-5M retrieval and calculate geolocation metrics."
    )
    parser.add_argument(
        "--dataset",
        default="europe-easy",
        help="Dataset/competition id. Default: europe-easy",
    )
    parser.add_argument(
        "--index",
        choices=INDEX_CHOICES,
        default="fp32",
        help="Reference representation/index. Default: fp32",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=5,
        help="Number of nearest OSV-5M references to retain. Default: 5",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of images to evaluate.",
    )
    parser.add_argument(
        "--device",
        default="cuda" if torch.cuda.is_available() else "cpu",
        choices=["cuda", "cpu"],
        help="Device used to compute SALAD query descriptors.",
    )
    parser.add_argument(
        "--demo-root",
        type=Path,
        default=default_demo_root,
        help=f"Path to demo_and_extension. Default: {default_demo_root}",
    )
    parser.add_argument(
        "--master-dir",
        type=Path,
        default=script_dir / "osv-5m_europe" / "salad_embeddings_fp32",
        help="Float32 master embedding directory.",
    )
    parser.add_argument(
        "--index-dir",
        type=Path,
        default=script_dir / "salad_compression_benchmark",
        help="Directory containing compressed FAISS indexes.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=script_dir / "results",
        help="Output directory. Default: salad/results",
    )
    return parser.parse_args()


def extract_coordinates(google_maps_link: str) -> tuple[float, float]:
    match = GOOGLE_MAPS_COORD_RE.search(google_maps_link)
    if not match:
        raise ValueError(
            f"Could not extract coordinates from Google Maps link: {google_maps_link}"
        )
    return float(match.group("lat")), float(match.group("lon"))


def load_ground_truth(competition_path: Path) -> dict[str, dict[str, Any]]:
    competition = json.loads(competition_path.read_text(encoding="utf-8"))

    ground_truth: dict[str, dict[str, Any]] = {}
    for location in competition.get("locations", []):
        location_id = location["id"]
        lat, lon = extract_coordinates(location["google_maps_link"])
        ground_truth[location_id] = {
            "lat": lat,
            "lon": lon,
            "country": location.get("country"),
            "city_or_region": location.get("city_or_region"),
            "difficulty": location.get("difficulty"),
            "primary_clue_type": location.get("primary_clue_type"),
        }

    if not ground_truth:
        raise ValueError(f"No locations found in {competition_path}")

    return ground_truth


def find_images(image_dir: Path, limit: int | None) -> list[Path]:
    images = sorted(
        p for p in image_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )
    if limit is not None:
        images = images[:limit]
    return images


def repo_relative_path(path: Path) -> str:
    repo_root = Path(__file__).resolve().parent.parent
    absolute_path = path.resolve()
    try:
        relative_path = absolute_path.relative_to(repo_root)
    except ValueError:
        relative_path = Path(os.path.relpath(absolute_path, repo_root))
    return relative_path.as_posix()


def distance_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    return float(geodesic((a_lat, a_lon), (b_lat, b_lon)).km)


def population_std(values: list[float]) -> float:
    return statistics.pstdev(values) if len(values) > 1 else 0.0


def rmse(values: list[float]) -> float:
    return math.sqrt(sum(v * v for v in values) / len(values))


def percent_within(values: list[float], threshold_km: float) -> float:
    return 100.0 * sum(v <= threshold_km for v in values) / len(values)


def round_float(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def make_transform():
    return transforms.Compose(
        [
            transforms.Resize(
                IMAGE_SIZE,
                interpolation=transforms.InterpolationMode.BILINEAR,
            ),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )


def load_salad(device: str):
    model = torch.hub.load(
        "serizba/salad",
        "dinov2_salad",
        trust_repo=True,
    )
    return model.eval().to(device)


def embed_image(model, transform, image_path: Path, device: str) -> np.ndarray:
    with Image.open(image_path) as image:
        tensor = transform(image.convert("RGB")).unsqueeze(0).to(device)

    with torch.inference_mode():
        descriptor = model(tensor)

    if isinstance(descriptor, (tuple, list)):
        descriptor = descriptor[0]

    if descriptor.ndim != 2 or descriptor.shape != (1, DESCRIPTOR_DIM):
        raise RuntimeError(
            f"Unexpected SALAD output shape {tuple(descriptor.shape)}; "
            f"expected (1, {DESCRIPTOR_DIM})"
        )

    return descriptor.detach().float().cpu().numpy().astype(np.float32, copy=False)


def embedding_shards(master_dir: Path) -> list[Path]:
    shards = sorted(master_dir.glob("embeddings_*.npy"))
    if not shards:
        raise FileNotFoundError(f"No embeddings_*.npy found in {master_dir}")
    return shards


def shard_row_start(shard: Path) -> int:
    info_path = shard.with_suffix(".json")
    if not info_path.exists():
        raise FileNotFoundError(info_path)
    info = json.loads(info_path.read_text(encoding="utf-8"))
    return int(info["row_start"])


def merge_topk(
    best_distances: np.ndarray,
    best_indices: np.ndarray,
    new_distances: np.ndarray,
    new_indices: np.ndarray,
    k: int,
) -> tuple[np.ndarray, np.ndarray]:
    distances = np.concatenate([best_distances, new_distances], axis=1)
    indices = np.concatenate([best_indices, new_indices], axis=1)

    selected = np.argpartition(distances, kth=k - 1, axis=1)[:, :k]
    rows = np.arange(distances.shape[0])[:, None]

    distances = distances[rows, selected]
    indices = indices[rows, selected]

    ordering = np.argsort(distances, axis=1)
    return distances[rows, ordering], indices[rows, ordering]


class FP32ShardedSearcher:
    def __init__(self, master_dir: Path):
        self.shards = embedding_shards(master_dir)

    def search(self, query: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
        best_distances = np.full((len(query), k), np.inf, dtype=np.float32)
        best_indices = np.full((len(query), k), -1, dtype=np.int64)

        for shard in self.shards:
            reference = np.load(shard, mmap_mode="r")
            if reference.shape[1] != DESCRIPTOR_DIM:
                raise RuntimeError(
                    f"Unexpected descriptor dimension in {shard}: {reference.shape}"
                )

            index = faiss.IndexFlatL2(DESCRIPTOR_DIM)
            index.add(np.asarray(reference, dtype=np.float32))
            distances, indices = index.search(query, k)

            indices = indices.astype(np.int64) + shard_row_start(shard)
            best_distances, best_indices = merge_topk(
                best_distances,
                best_indices,
                distances,
                indices,
                k,
            )

            del index, reference

        return best_distances, best_indices


class FaissSearcher:
    def __init__(self, index_path: Path):
        if not index_path.exists():
            raise FileNotFoundError(
                f"FAISS index not found: {index_path}\n"
                "Build it first with benchmark_salad_compression.py."
            )
        self.index = faiss.read_index(str(index_path))

    def search(self, query: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
        return self.index.search(query, k)


def load_searcher(index_name: str, master_dir: Path, index_dir: Path):
    if index_name == "fp32":
        return FP32ShardedSearcher(master_dir)
    return FaissSearcher(index_dir / f"{index_name}.faiss")


def weighted_coordinate(candidates: list[dict[str, Any]]) -> tuple[float, float]:
    weights = np.asarray(
        [1.0 / (float(c["distance"]) + 1e-12) for c in candidates],
        dtype=np.float64,
    )
    weights /= weights.sum()

    lat = float(
        np.sum(weights * np.asarray([c["lat"] for c in candidates], dtype=np.float64))
    )
    lon = float(
        np.sum(weights * np.asarray([c["lon"] for c in candidates], dtype=np.float64))
    )
    return lat, lon


def evaluate_one_image(
    model,
    transform,
    searcher,
    reference: pd.DataFrame,
    image_path: Path,
    truth: dict[str, Any],
    top_k: int,
    device: str,
) -> dict[str, Any]:
    descriptor_start = time.perf_counter()
    descriptor = embed_image(model, transform, image_path, device)
    descriptor_seconds = time.perf_counter() - descriptor_start

    search_start = time.perf_counter()
    distances, indices = searcher.search(descriptor, top_k)
    search_seconds = time.perf_counter() - search_start

    candidates: list[dict[str, Any]] = []

    for rank, (retrieval_distance, row_id) in enumerate(
        zip(distances[0], indices[0]),
        start=1,
    ):
        if int(row_id) < 0:
            continue

        ref = reference.iloc[int(row_id)]
        pred_lat = float(ref["latitude"])
        pred_lon = float(ref["longitude"])
        error = distance_km(
            truth["lat"],
            truth["lon"],
            pred_lat,
            pred_lon,
        )

        candidates.append(
            {
                "rank": rank,
                "reference_row_id": int(row_id),
                "reference_id": str(ref["id"]),
                "reference_split": str(ref["split"]),
                "lat": pred_lat,
                "lon": pred_lon,
                "distance": float(retrieval_distance),
                "error_km": error,
            }
        )

    if not candidates:
        raise RuntimeError("No retrieval candidates returned.")

    top1 = candidates[0]
    oracle = min(candidates, key=lambda c: c["error_km"])

    mean_lat = float(np.mean([c["lat"] for c in candidates]))
    mean_lon = float(np.mean([c["lon"] for c in candidates]))
    mean_error = distance_km(
        truth["lat"],
        truth["lon"],
        mean_lat,
        mean_lon,
    )

    weighted_lat, weighted_lon = weighted_coordinate(candidates)
    weighted_error = distance_km(
        truth["lat"],
        truth["lon"],
        weighted_lat,
        weighted_lon,
    )

    return {
        "location_id": image_path.stem,
        "image": repo_relative_path(image_path),
        "ground_truth": truth,
        "top1": top1,
        "topk_mean": {
            "lat": mean_lat,
            "lon": mean_lon,
            "error_km": mean_error,
        },
        "topk_weighted": {
            "lat": weighted_lat,
            "lon": weighted_lon,
            "error_km": weighted_error,
        },
        "topk_oracle": oracle,
        "descriptor_seconds": descriptor_seconds,
        "search_seconds": search_seconds,
        "inference_seconds": descriptor_seconds + search_seconds,
        "candidates": candidates,
    }


def error_summary(values: list[float]) -> dict[str, Any]:
    return {
        "mean_km": round_float(statistics.mean(values), 3),
        "median_km": round_float(statistics.median(values), 3),
        "std_km": round_float(population_std(values), 3),
        "rmse_km": round_float(rmse(values), 3),
        "min_km": round_float(min(values), 3),
        "max_km": round_float(max(values), 3),
        "threshold_accuracy": {
            f"within_{threshold}_km_percent": round_float(
                percent_within(values, threshold), 3
            )
            for threshold in DISTANCE_THRESHOLDS_KM
        },
    }


def build_summary(
    results: list[dict[str, Any]],
    dataset: str,
    index_name: str,
    model_load_seconds: float,
    index_load_seconds: float,
) -> dict[str, Any]:
    top1_errors = [float(r["top1"]["error_km"]) for r in results]
    mean_errors = [float(r["topk_mean"]["error_km"]) for r in results]
    weighted_errors = [float(r["topk_weighted"]["error_km"]) for r in results]
    oracle_errors = [float(r["topk_oracle"]["error_km"]) for r in results]

    descriptor_times = [float(r["descriptor_seconds"]) for r in results]
    search_times = [float(r["search_seconds"]) for r in results]
    total_times = [float(r["inference_seconds"]) for r in results]

    return {
        "dataset": dataset,
        "model": "SALAD + OSV-5M",
        "index": index_name,
        "n_images": len(results),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "distance_unit": "km",
        "top1_error": error_summary(top1_errors),
        "topk_mean_error": error_summary(mean_errors),
        "topk_weighted_error": error_summary(weighted_errors),
        "topk_oracle_error": error_summary(oracle_errors),
        "timing": {
            "model_load_seconds": round_float(model_load_seconds, 3),
            "index_load_seconds": round_float(index_load_seconds, 3),
            "mean_descriptor_seconds": round_float(statistics.mean(descriptor_times), 3),
            "mean_search_seconds": round_float(statistics.mean(search_times), 3),
            "mean_total_seconds": round_float(statistics.mean(total_times), 3),
            "total_seconds": round_float(sum(total_times), 3),
        },
    }


def write_csv(path: Path, results: list[dict[str, Any]]) -> None:
    fieldnames = [
        "location_id",
        "country",
        "city_or_region",
        "difficulty",
        "primary_clue_type",
        "gt_lat",
        "gt_lon",
        "pred_lat",
        "pred_lon",
        "reference_id",
        "reference_split",
        "retrieval_distance",
        "top1_error_km",
        "topk_mean_error_km",
        "topk_weighted_error_km",
        "topk_oracle_rank",
        "topk_oracle_error_km",
        "descriptor_seconds",
        "search_seconds",
        "inference_seconds",
        "image",
    ]

    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for result in results:
            truth = result["ground_truth"]
            top1 = result["top1"]
            oracle = result["topk_oracle"]

            writer.writerow(
                {
                    "location_id": result["location_id"],
                    "country": truth.get("country"),
                    "city_or_region": truth.get("city_or_region"),
                    "difficulty": truth.get("difficulty"),
                    "primary_clue_type": truth.get("primary_clue_type"),
                    "gt_lat": f'{truth["lat"]:.7f}',
                    "gt_lon": f'{truth["lon"]:.7f}',
                    "pred_lat": f'{top1["lat"]:.7f}',
                    "pred_lon": f'{top1["lon"]:.7f}',
                    "reference_id": top1["reference_id"],
                    "reference_split": top1["reference_split"],
                    "retrieval_distance": f'{top1["distance"]:.8f}',
                    "top1_error_km": f'{top1["error_km"]:.3f}',
                    "topk_mean_error_km": f'{result["topk_mean"]["error_km"]:.3f}',
                    "topk_weighted_error_km": f'{result["topk_weighted"]["error_km"]:.3f}',
                    "topk_oracle_rank": oracle["rank"],
                    "topk_oracle_error_km": f'{oracle["error_km"]:.3f}',
                    "descriptor_seconds": f'{result["descriptor_seconds"]:.3f}',
                    "search_seconds": f'{result["search_seconds"]:.3f}',
                    "inference_seconds": f'{result["inference_seconds"]:.3f}',
                    "image": result["image"],
                }
            )


def print_error_block(label: str, block: dict[str, Any]) -> None:
    print(label)
    print(f'  Mean:                   {block["mean_km"]:.3f} km')
    print(f'  Median:                 {block["median_km"]:.3f} km')
    print(f'  Std (population):       {block["std_km"]:.3f} km')
    print(f'  RMSE:                   {block["rmse_km"]:.3f} km')

    for threshold in DISTANCE_THRESHOLDS_KM:
        value = block["threshold_accuracy"][f"within_{threshold}_km_percent"]
        print(f"  <= {threshold:4d} km:             {value:7.2f}%")


def print_summary(summary: dict[str, Any]) -> None:
    timing = summary["timing"]

    print("\n" + "=" * 72)
    print("SALAD + OSV-5M STATIC EVALUATION SUMMARY")
    print("=" * 72)
    print(f'Dataset:                 {summary["dataset"]}')
    print(f'Index:                   {summary["index"]}')
    print(f'Images evaluated:        {summary["n_images"]}')
    print()

    print_error_block("Top-1 geodesic error:", summary["top1_error"])
    print()
    print_error_block("Top-K mean coordinate:", summary["topk_mean_error"])
    print()
    print_error_block("Top-K inverse-L2 weighted coordinate:", summary["topk_weighted_error"])
    print()
    print_error_block("Top-K oracle diagnostic:", summary["topk_oracle_error"])

    print()
    print("Timing:")
    print(f'  Model load:             {timing["model_load_seconds"]:.3f} s')
    print(f'  Index load:             {timing["index_load_seconds"]:.3f} s')
    print(f'  Mean descriptor/image:  {timing["mean_descriptor_seconds"]:.3f} s')
    print(f'  Mean search/image:      {timing["mean_search_seconds"]:.3f} s')
    print(f'  Mean total/image:       {timing["mean_total_seconds"]:.3f} s')
    print("=" * 72)


def main() -> None:
    args = parse_args()

    if args.top_k < 1:
        raise ValueError("--top-k must be at least 1")
    if args.limit is not None and args.limit < 1:
        raise ValueError("--limit must be at least 1")
    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA requested, but torch.cuda.is_available() is False."
        )

    demo_root = args.demo_root.expanduser().resolve()
    competition_path = (
        demo_root / "data" / "competitions" / f"{args.dataset}.json"
    )
    image_dir = (
        demo_root / "data" / "starting-images" / args.dataset
    )

    master_dir = args.master_dir.expanduser().resolve()
    index_dir = args.index_dir.expanduser().resolve()
    reference_csv = master_dir / "reference.csv"
    output_dir = args.output_dir.expanduser().resolve()

    print(f"Using device: {args.device}")
    print(f"PyTorch version: {torch.__version__}")
    print(f"Dataset:     {args.dataset}")
    print(f"Index:       {args.index}")
    print(f"Competition: {competition_path}")
    print(f"Images:      {image_dir}")
    print(f"Reference:   {reference_csv}")

    if not competition_path.exists():
        raise FileNotFoundError(competition_path)
    if not image_dir.exists():
        raise FileNotFoundError(image_dir)
    if not reference_csv.exists():
        raise FileNotFoundError(reference_csv)

    ground_truth = load_ground_truth(competition_path)
    images = find_images(image_dir, args.limit)

    if not images:
        raise RuntimeError(f"No starting images found in {image_dir}")

    missing_ground_truth = [
        image.stem for image in images
        if image.stem not in ground_truth
    ]
    if missing_ground_truth:
        raise RuntimeError(
            "Images without matching ground truth: "
            + ", ".join(missing_ground_truth)
        )

    reference = pd.read_csv(reference_csv, low_memory=False)
    if "row_id" not in reference.columns:
        raise RuntimeError("reference.csv has no row_id column.")

    reference = reference.sort_values("row_id").reset_index(drop=True)

    print(f"\nReference images: {len(reference):,}")
    print(f"Images to evaluate: {len(images):,}")

    print("\nLoading SALAD model...")
    start = time.perf_counter()
    model = load_salad(args.device)
    transform = make_transform()
    model_load_seconds = time.perf_counter() - start
    print(f"SALAD loaded successfully in {model_load_seconds:.2f} s.")

    print(f"\nLoading search backend '{args.index}'...")
    start = time.perf_counter()
    searcher = load_searcher(
        index_name=args.index,
        master_dir=master_dir,
        index_dir=index_dir,
    )
    index_load_seconds = time.perf_counter() - start
    print(f"Search backend ready in {index_load_seconds:.2f} s.")

    results: list[dict[str, Any]] = []

    try:
        for index, image_path in enumerate(images, start=1):
            truth = ground_truth[image_path.stem]
            label = truth.get("city_or_region") or image_path.stem

            print(f"\n[{index}/{len(images)}] {image_path.name} | {label}")

            result = evaluate_one_image(
                model=model,
                transform=transform,
                searcher=searcher,
                reference=reference,
                image_path=image_path,
                truth=truth,
                top_k=args.top_k,
                device=args.device,
            )
            results.append(result)

            top1 = result["top1"]
            weighted = result["topk_weighted"]
            oracle = result["topk_oracle"]

            print(
                f'  Top-1: ref={top1["reference_id"]}, '
                f'lat={top1["lat"]:.6f}, lon={top1["lon"]:.6f}, '
                f'error={top1["error_km"]:.2f} km, '
                f'L2={top1["distance"]:.6f}'
            )

            if args.top_k > 1:
                print(
                    f'  Weighted top-{args.top_k}: '
                    f'error={weighted["error_km"]:.2f} km'
                )
                print(
                    f'  Oracle top-{args.top_k}: '
                    f'rank={oracle["rank"]}, '
                    f'error={oracle["error_km"]:.2f} km'
                )

            print(
                f'  Descriptor: {result["descriptor_seconds"]:.2f} s | '
                f'Search: {result["search_seconds"]:.2f} s'
            )

    except KeyboardInterrupt:
        print("\nStopped by user.")
        sys.exit(130)

    summary = build_summary(
        results=results,
        dataset=args.dataset,
        index_name=args.index,
        model_load_seconds=model_load_seconds,
        index_load_seconds=index_load_seconds,
    )
    print_summary(summary)

    output_dir.mkdir(parents=True, exist_ok=True)

    base_name = f"salad_{args.index}_{args.dataset}"
    csv_path = output_dir / f"{base_name}.csv"
    details_path = output_dir / f"{base_name}_details.json"
    summary_path = output_dir / f"{base_name}_summary.json"

    write_csv(csv_path, results)

    details_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\nSaved results:")
    print(f"  CSV:     {csv_path}")
    print(f"  Details: {details_path}")
    print(f"  Summary: {summary_path}")


if __name__ == "__main__":
    main()

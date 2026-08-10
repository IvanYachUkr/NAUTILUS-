$ErrorActionPreference = "Stop"

Write-Host "============================================================"
Write-Host "SALAD TOOLCHAIN SMOKE TEST"
Write-Host "============================================================"

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

Write-Host "`n[1/4] Checking Python + CUDA + imports..."
python -c "import torch,numpy,pandas,PIL,torchvision; print('Python deps OK'); print('Torch:',torch.__version__); print('CUDA:',torch.cuda.is_available()); print('GPU:',torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO CUDA GPU')"
if ($LASTEXITCODE -ne 0) { throw "Dependency/CUDA check failed." }

python -c "import faiss; print('FAISS:', getattr(faiss,'__version__','available'))"
if ($LASTEXITCODE -ne 0) { throw "FAISS import failed." }

Write-Host "`n[2/4] Building 32 reference embeddings..."
python .\build_salad_reference_embeddings.py `
  --device cuda `
  --batch-size 4 `
  --workers 2 `
  --shard-size 16 `
  --max-images 32 `
  --output .\_smoke\reference_embeddings
if ($LASTEXITCODE -ne 0) { throw "Reference embedding smoke test failed." }

Write-Host "`n[3/4] Embedding up to 3 OpenGuessr queries..."
python .\embed_openguessr_queries.py `
  --device cuda `
  --batch-size 3 `
  --max-queries 3 `
  --output .\_smoke\queries
if ($LASTEXITCODE -ne 0) { throw "Query embedding smoke test failed." }

Write-Host "`n[4/4] Testing exact retrieval + lightweight compression..."
python .\benchmark_salad_compression.py `
  --master .\_smoke\reference_embeddings `
  --queries .\_smoke\queries `
  --output .\_smoke\benchmark `
  --methods sqfp16 sq8 `
  --top-k 3 `
  --train-sample 32
if ($LASTEXITCODE -ne 0) { throw "Compression benchmark smoke test failed." }

Write-Host "`n============================================================"
Write-Host "SMOKE TEST PASSED"
Write-Host "All three Python stages executed successfully."
Write-Host "============================================================"

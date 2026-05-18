#!/usr/bin/env bash
# CI gate: forbid prisma.<SoftDeleteModel>.delete( and deleteMany( calls.
# See specs/001-phase-0-foundation/research.md R3.

set -euo pipefail

SOFT_DELETE_MODELS=(user userAddress chef category menu item order userReview transaction)
ALLOW_HARD_DELETE_MODELS=(menuAvailability)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"

if [ ! -d "$SRC_DIR" ]; then
  echo "ci-no-hard-delete: $SRC_DIR not found"
  exit 1
fi

fail=0
for model in "${SOFT_DELETE_MODELS[@]}"; do
  pattern="prisma(Service)?(\\.extended)?\\.${model}\\.(delete|deleteMany)\\s*\\("
  if grep -RInE "$pattern" "$SRC_DIR" --include='*.ts' --exclude-dir=node_modules; then
    echo ""
    echo "FORBIDDEN: hard delete on soft-delete model '$model'."
    echo "Use prisma.<model>.softDelete({ id }) instead."
    fail=1
  fi
done

# Allow-list: hard-delete is intentional for these models
for model in "${ALLOW_HARD_DELETE_MODELS[@]}"; do
  pattern="prisma(Service)?(\\.extended)?\\.${model}\\.(delete|deleteMany)\\s*\\("
  # intentionally no-op — these models are allowed to hard-delete
  # but we keep the loop so the list is explicit
  continue
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "ci-no-hard-delete: OK (no forbidden delete calls found)"

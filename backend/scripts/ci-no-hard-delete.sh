#!/usr/bin/env bash
# CI gate: forbid prisma.<SoftDeleteModel>.delete( and deleteMany( calls.
# See specs/001-phase-0-foundation/research.md R3.

set -euo pipefail

SOFT_DELETE_MODELS=(user userAddress chef category menu item order userReview transaction)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"

if [ ! -d "$SRC_DIR" ]; then
  echo "ci-no-hard-delete: $SRC_DIR not found"
  exit 1
fi

fail=0
for model in "${SOFT_DELETE_MODELS[@]}"; do
  pattern="prisma(Service)?(\\.extended)?\\.${model}\\.(delete|deleteMany)\\("
  if grep -RInE "$pattern" "$SRC_DIR" --include='*.ts' --exclude-dir=node_modules; then
    echo ""
    echo "FORBIDDEN: hard delete on soft-delete model '$model'."
    echo "Use prisma.<model>.softDelete({ where: { id } }) instead."
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "ci-no-hard-delete: OK (no forbidden delete calls found)"

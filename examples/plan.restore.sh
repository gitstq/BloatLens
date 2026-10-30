#!/bin/sh
#
# BloatLens restore script
# generated at 2026-10-30T16:25:47.378Z
#
# 本脚本是幂等的：重复执行不会改变最终状态，也不会产生副作用。
# 用法： sh restore.sh        （按设备执行）
#       sh restore.sh --dry-run  （仅打印，不执行）

set -eu

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi

run() {
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; else "$@" || echo "[warn] failed: $*"; fi
}

echo "Restoring 5 package(s)..."

# com.sony.tv.telemetry  (grade=safe, netScore=78)
run adb shell pm enable com.sony.tv.telemetry

# com.sony.tv.telemetry.legacy  (grade=safe, netScore=77)
run adb shell pm enable com.sony.tv.telemetry.legacy

# com.sony.tv.adservice  (grade=safe, netScore=74)
run adb shell pm enable com.sony.tv.adservice

# com.sony.tv.usagereport  (grade=safe, netScore=72)
run adb shell pm enable com.sony.tv.usagereport

# com.sony.tv.tracking  (grade=safe, netScore=71)
run adb shell pm enable com.sony.tv.tracking

echo "Restore finished."

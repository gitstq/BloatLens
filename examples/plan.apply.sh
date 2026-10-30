#!/bin/sh
# BloatLens apply script — 与 restore.sh 成对生成
# device: (default)   packages: 25

set -eu
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi
run() {
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; else "$@" || echo "[warn] failed: $*"; fi
}

# com.sony.tv.telemetry  (safe, net=78) — 4 条信号命中，无可观测依赖项，建议禁用
run adb shell pm disable-user --user 0 com.sony.tv.telemetry

# com.sony.tv.telemetry.legacy  (safe, net=77) — 4 条信号命中，无可观测依赖项，建议禁用
run adb shell pm disable-user --user 0 com.sony.tv.telemetry.legacy

# com.sony.tv.adservice  (safe, net=74) — 4 条信号命中，无可观测依赖项，建议禁用
run adb shell pm disable-user --user 0 com.sony.tv.adservice

# com.sony.tv.usagereport  (safe, net=72) — 4 条信号命中，无可观测依赖项，建议禁用
run adb shell pm disable-user --user 0 com.sony.tv.usagereport

# com.sony.tv.tracking  (safe, net=71) — 4 条信号命中，无可观测依赖项，建议禁用
run adb shell pm disable-user --user 0 com.sony.tv.tracking


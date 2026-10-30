<div align="center">

# 🔍 BloatLens

**Zero-dependency, offline-first Android / Android TV bloatware audit & reversible debloat orchestration engine**

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md)

![zero-dependency](https://img.shields.io/badge/dependencies-0-3fb950?style=flat-square)
![node](https://img.shields.io/badge/node-%3E%3D18-3fb950?style=flat-square&logo=node.js)
![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![offline](https://img.shields.io/badge/network-not%20required-blueviolet?style=flat-square)
![typescript](https://img.shields.io/badge/typescript-strict-3178c6?style=flat-square&logo=typescript)

</div>

---

## 🎉 What is BloatLens?

Your Android TV starts phoning home the moment you plug it in.

There are ad slots on the boot screen, sponsored rows on the launcher, and telemetry plus crash-reporting daemons sitting in the background. Most of them **cannot be uninstalled**, because they are burned into `/system/priv-app`. That leaves you with two bad options: root the device (goodbye warranty, goodbye OTA), or copy-paste a package blacklist from some forum and run `adb shell pm disable-user` on every entry — with no idea what you are disabling, or what it will take down with it.

**BloatLens is the third option.**

It is not another blacklist. It is a **deterministic risk engine**: it reads a device snapshot, scores every package with weighted signals, computes how far the damage would spread if you disabled it, and hands you a debloat plan where **every single action is reversible**.

### The problem, and the fix

| 😖 Today | ✅ With BloatLens |
| --- | --- |
| Blacklists come from nowhere and may not fit your model | Brand profile is inferred from `getprop`; scoring uses partition, namespace and permissions |
| Disable the wrong package and the remote, casting or launcher dies | **Blast radius**: BloatLens computes *who needs it* before recommending anything |
| Rolling back means digging through shell history | Every action ships with an **idempotent** `restore.sh` — one command to undo everything |
| You must be tethered to the device just to see the risk | **Fully offline**: a plain `pm list packages -f` dump is enough for a complete report |
| The tool pulls 40 dependencies and won't run in CI | **Zero runtime dependencies**; `npx bloatlens` just works, and doubles as a CI gate |

### Inspiration and originality

The product inspiration comes from a genuine, widely discussed need in the Android TV community. **BloatLens copies no source code and no private dataset from any existing project.** The rule library is derived entirely from publicly documented Android package-naming conventions, and the scoring model, dependency-graph algorithm and rollback mechanism are all original designs.

### How it differs from the "package list" approach

| | Static blacklist | **BloatLens** |
| --- | --- | --- |
| Decision | Match → disable | **Weighted multi-signal score** minus dependency penalty — a continuous score, not a boolean |
| Safety | Trust the list author | **Protected-list veto** plus a quantified blast radius |
| Explainability | None | Rule ID, weight and matched evidence for every verdict |
| Reversibility | Remember your own commands | **Plan-as-script**: apply and restore generated as a pair, both idempotent |
| Requirements | Device attached | **Works offline** from a text snapshot |
| Integration | Manual | JSON / Markdown / HTML reports plus semantic exit codes |

---

## ✨ Features

- 🧠 **Multi-signal scoring engine** — **23 built-in rules across 8 categories**: telemetry, advertising, promotion, OTA, vendor namespace, partition, sensitive permissions and boot receivers.
- 🔗 **Reverse-dependency blast radius** — builds a graph from `sharedUserId`, `uses-library` and a built-in system-coupling table, then BFS-walks it to tell you **the cost of disabling** before you do it.
- 🛡️ **Protected-list veto** — 15 categories of critical components (SystemUI, Settings, GMS, launcher, content providers…) are **never** recommended for disabling, no matter how strong the signals are.
- 🔍 **Cross-correlation bonus (synergy)** — when vendor namespace, feature keyword and preinstalled partition all line up, confidence gets an explicit boost, cutting false positives.
- ↩️ **Reversibility first** — every action carries its undo command; the plan ships with an **idempotent** `restore.sh` and is validated before it is returned.
- 📴 **Completely offline** — no network calls, no APIs, nothing uploaded. A snapshot is just a local text file.
- 🎯 **Automatic brand profiling** — parses `getprop` for brand, model, TV form factor and Android version, and shows its evidence.
- 📊 **Four report formats** — colourised terminal, JSON (for CI), Markdown (for PRs) and **self-contained HTML** (inline CSS, just double-click).
- 🚦 **CI-gate ready** — `--fail-on safe|caution|risky` with semantic exit codes: `0` pass / `2` irreversible / `3` gate hit.
- 🧩 **Zero runtime dependencies** — strict TypeScript; the `dependencies` field is empty.
- 🔌 **CLI and library** — run it with `npx`, or `require('bloatlens')` inside your own pipeline.
- 🌐 **Trilingual docs** — Simplified Chinese, Traditional Chinese and English, switchable from the top of the page.

---

## 🚀 Quick Start

### Requirements

| | |
| --- | --- |
| **Node.js** | `>= 18` (20 LTS or newer recommended) |
| **adb** (optional) | Only needed by `scan`; offline auditing needs nothing |
| **OS** | Windows / macOS / Linux |
| **Network** | **Not required** |

### Try it instantly (no device, no network)

```bash
npx bloatlens demo
```

Runs the whole pipeline against a built-in synthetic snapshot modelled on a Sony BRAVIA Android TV.

### Install

```bash
# 1. Run without installing (recommended)
npx bloatlens --help

# 2. Global install
npm install -g bloatlens
bloatlens --help

# 3. As a library
npm install bloatlens
```

### Clean your TV in three minutes

```bash
# ① On the TV: Settings → Device Preferences → About → tap "Build" repeatedly
#    then Developer options → enable USB debugging
# ② On your computer (same Wi-Fi), connect to the TV IP (usually port 5555)
adb connect 192.168.1.20:5555
adb devices

# ③ Scan and generate a report
npx bloatlens scan --with-dumpsys --format html --out report.html

# ④ Once you're satisfied, generate the plan (restore script included)
npx bloatlens plan --packages packages.txt --getprop getprop.txt --out myplan.json

# ⑤ Dry-run first and read every line
sh myplan.apply.sh --dry-run

# ⑥ Execute
sh myplan.apply.sh

# ⑦ Changed your mind? Roll back
sh myplan.restore.sh
```

> ⚠️ BloatLens is **read-only by default**. Nothing touches your device until you explicitly run a generated script. Always keep `restore.sh`.

### Library usage

```js
const fs = require('node:fs');
const { parseSnapshotFiles, evaluate, buildPlan, render } = require('bloatlens');

// 1) Build a snapshot from adb text output (no device needed)
const snapshot = parseSnapshotFiles({
  packages: fs.readFileSync('packages.txt', 'utf8'), // adb shell pm list packages -f
  disabled: fs.readFileSync('disabled.txt', 'utf8'), // adb shell pm list packages -d
  getprop: fs.readFileSync('getprop.txt', 'utf8'),   // adb shell getprop
  dumpsys: fs.readFileSync('dumpsys.txt', 'utf8'),   // adb shell dumpsys package
});

// 2) Evaluate: score, grade and explainable evidence for every package
const { verdicts, graph } = evaluate(snapshot, {
  safeThreshold: 70,
  allowlist: ['com.example.must.keep'],
});

console.log(verdicts[0].package.name, verdicts[0].netScore, verdicts[0].grade);
console.log(verdicts[0].signals); // [{ id, label, weight, evidence }, ...]

// 3) Build a reversible plan
const plan = buildPlan(snapshot, { includeCaution: false });
console.log(plan.reversibility.allReversible); // true
fs.writeFileSync('restore.sh', plan.reversibility.restoreScript);

// 4) Render any report format
fs.writeFileSync('report.html', render('html', plan, verdicts));
```

---

## 📖 Usage Guide

### Commands

| Command | Purpose | Device required |
| --- | --- | --- |
| `bloatlens demo` | Full pipeline on a synthetic sample | ❌ |
| `bloatlens scan` | Audit a live device over adb | ✅ |
| `bloatlens audit` | Offline audit from snapshot files | ❌ |
| `bloatlens plan` | Generate plan plus apply/restore scripts | ❌ |
| `bloatlens explain <pkg>` | Why was this package scored this way? | ❌ |
| `bloatlens depends <pkg>` | Dependencies and blast radius | ❌ |
| `bloatlens rules` | List the built-in rule library | ❌ |

### ① Capture a snapshot

```bash
adb shell pm list packages -f  > packages.txt
adb shell pm list packages -d  > disabled.txt
adb shell getprop              > getprop.txt
adb shell dumpsys package      > dumpsys.txt   # optional: enables the full dependency graph
```

`dumpsys.txt` is optional but **strongly recommended** — it is the only source of `sharedUserId` and `uses-library`, which is what makes the blast radius meaningful.

### ② Audit offline

```bash
bloatlens audit \
  --packages packages.txt \
  --disabled disabled.txt \
  --getprop  getprop.txt \
  --dumpsys  dumpsys.txt \
  --format   html \
  --out      report.html
```

Sample terminal output:

```
Debloat plan
  Device: sony/BRAVIA 4K GB (TV)
  Packages: 25   Protected: 11
  disable-user: 4   suspend: 0   skip: 21
  Reversibility: all reversible

PACKAGE                          GRADE     net  sig  dep  VERDICT
────────────────────────────────────────────────────────────────
com.sony.tv.telemetry             SAFE     78     4    -  4 signals, no dependents: disable
com.sony.tv.adservice             SAFE     74     4    -  4 signals, no dependents: disable
com.sony.tv.pushsdk            CAUTION     68     6    -  moderate evidence: observe first
com.sony.tv.contentrow         CAUTION     59     5    1  moderate evidence: observe first
com.android.systemui             KEEP      0     1    -  protected: SystemUI, no launcher without it
```

### ③ Explain a verdict

```bash
bloatlens explain com.sony.tv.telemetry
```

```
📦 com.sony.tv.telemetry
   path:      /system/priv-app/TelemetrySvc/TelemetrySvc.apk
   partition: system-priv-app   state: enabled   preinstalled: yes   autostart: no

   raw score:    78
   blast penalty: -0
   final net:    78  (SAFE)

   signals:
     • [telemetry.core] Telemetry upload service  (+38)  evidence: telemetry
     • [ns.sony] Sony vendor namespace  (+10)  evidence: com.sony.
     • [partition.preset] located in /system/priv-app (privileged preinstall)  (+10)
     • [synergy.vendor-preinstall-bloat] vendor preinstall + keyword cross-correlation  (+20)

   dependents: none
   verdict: 4 signals hit, no observable dependents — safe to disable
```

### ④ Measure the cost of disabling

```bash
bloatlens depends com.google.android.gms
```

```
🔗 com.google.android.gms
   depends on: com.android.vending, com.google.android.gsf
   needed by: com.android.vending, com.google.android.gsf, com.google.android.tungsten.home
   transitive impact: 3 packages
   blast radius penalty: 36
   ⚠️  Disabling this has a wide impact — keep it enabled.
```

### ⑤ Generate the plan and rollback script

```bash
bloatlens plan --packages packages.txt --getprop getprop.txt --dumpsys dumpsys.txt --out myplan.json
```

Three files come out:

| File | Purpose |
| --- | --- |
| `myplan.json` | Full plan: actions, undo commands, statistics |
| `myplan.apply.sh` | Apply script, supports `--dry-run` |
| `myplan.restore.sh` | **Idempotent** rollback script, supports `--dry-run` |

### Common flags

| Flag | Meaning | Default |
| --- | --- | --- |
| `--format <fmt>` | `terminal` / `json` / `markdown` / `html` | `terminal` |
| `--out <file>` | Write report to file | stdout |
| `--device <serial>` | Target a specific adb device | default device |
| `--with-dumpsys` | Also pull dumpsys during `scan` | off |
| `--allow <pkg,...>` | Extra allowlist (never recommended) | — |
| `--deny <pkg,...>` | Extra forced-clean list | — |
| `--include-caution` | Include CAUTION grade (default: SAFE only) | off |
| `--safe-threshold <n>` | SAFE threshold | `70` |
| `--caution-threshold <n>` | CAUTION threshold | `45` |
| `--no-blast-radius` | Disable blast-radius penalty (not advised) | off |
| `--rules <file>` | Load custom rules (JSON array) | — |
| `--fail-on <grade>` | CI gate threshold | — |
| `--limit <n>` | Rows shown in terminal report | `20` |
| `--no-color` | Strip ANSI colour | off |

### Grading

| Grade | Meaning | Default action |
| --- | --- | --- |
| 🟢 **SAFE** (`net ≥ 70`) | Cross-correlated signals, no observable dependents | `pm disable-user --user 0` |
| 🟡 **CAUTION** (`45 ≤ net < 70`) | Real signals but moderate evidence, or minor dependents | skipped by default; `pm suspend` with `--include-caution` |
| 🔴 **RISKY** (`20 ≤ net < 45`) | Weak signals or several dependents | keep enabled |
| ⚪ **KEEP** (`net < 20` or protected) | Weak, already disabled, or on the protected list | keep enabled |

### Custom rules (shareable)

```json
// my-rules.json
[
  {
    "id": "mybrand.telemetry",
    "pattern": "^com\\.mybrand\\.(telemetry|metrics)",
    "category": "telemetry",
    "weight": 35,
    "label": "MyBrand telemetry service",
    "brands": ["mybrand"]
  },
  {
    "id": "my.protect",
    "pattern": "^com\\.mybrand\\.remote$",
    "category": "bloat-feature",
    "weight": 0,
    "label": "Remote control service",
    "protect": true
  }
]
```

```bash
bloatlens audit --packages packages.txt --rules my-rules.json
```

### CI integration

```yaml
# .github/workflows/bloat-audit.yml
- name: BloatLens gate
  run: |
    npx bloatlens audit \
      --packages packages.txt \
      --getprop getprop.txt \
      --format json --out report.json \
      --fail-on safe
```

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Passed (gate not hit) |
| `1` | Runtime error (missing flag, file not found…) |
| `2` | Plan contains actions without an undo command |
| `3` | `--fail-on` threshold was hit |

### Typical scenarios

<details>
<summary>📺 <b>Check a brand-new Android TV</b></summary>

```bash
adb connect 192.168.1.20:5555
npx bloatlens scan --with-dumpsys --format html --out tv-report.html
open tv-report.html
```
Look at the `Protected` and `SAFE` counts before deciding to build a plan.
</details>

<details>
<summary>🏢 <b>Manage a fleet of identical devices</b></summary>

```bash
for ip in 192.168.1.{20,21,22,23}; do
  adb connect $ip:5555
  npx bloatlens scan --device $ip:5555 --format json --out "reports/$ip.json"
done
```
One model, one brand profile, one rule set — results are directly comparable.
</details>

<details>
<summary>🔁 <b>Re-audit after a firmware update</b></summary>

Vendors love re-enabling things during OTA. Re-run the audit; BloatLens reads `disabled.txt` and spots what got turned back on:

```bash
adb shell pm list packages -f > packages-new.txt
adb shell pm list packages -d > disabled-new.txt
npx bloatlens audit --packages packages-new.txt --disabled disabled-new.txt --getprop getprop.txt
```
</details>

<details>
<summary>🧪 <b>Research without a device</b></summary>

```bash
npx bloatlens demo
npx bloatlens rules
npx bloatlens explain com.sony.tv.adservice
```
</details>

---

## 💡 Design & Roadmap

### Philosophy

1. **Read-only first** — nothing is modified unless you run a generated script.
2. **Reversibility first** — an action without an undo path must never be generated. This is enforced, not suggested.
3. **Explainability first** — every verdict must answer "on what basis?", otherwise you cannot own the decision.
4. **Offline first** — a device snapshot is sensitive; it should never leave your disk.
5. **Determinism first** — no LLM, no sampling. Same input, same output, reproducible and regression-testable.

### Scoring model

```
netScore = clamp( Σ positive signal weights − blast radius penalty , 0, 100 )
```

**Positive signals (8 categories)**

| Category | Range | What it captures |
| --- | --- | --- |
| `telemetry` | 20 – 38 | Telemetry, tracking, crash reporting, log upload |
| `advertising` | 18 – 34 | Ad services, advertising IDs, attribution |
| `bloat-feature` | 12 – 20 | Content rows, partner preinstalls, push channels, voice wake |
| `ota` | 12 | System update service (deliberately conservative) |
| `vendor-namespace` | 6 – 10 | Who shipped it |
| `partition` | 2 – 10 | `/system/priv-app`(10) → `/data/app`(2) |
| `permission` | 10 – 16 | Count of sensitive permission groups |
| `autostart` | 7 | Registers `BOOT_COMPLETED` |

**Cross-correlation bonus**: `+20` when feature keyword, vendor namespace and preinstalled partition all hold at once. Three independent pieces of evidence agreeing drives the false-positive rate down.

**Negative signal (blast radius)**

```
penalty = min(100, direct dependents × 12 + transitive dependents × 3)
```

Evidence comes from `sharedUserId` (same UID is hard coupling), `uses-library` (explicit library dependency) and a built-in coupling table (the GMS family), walked with BFS up to 3 levels.

**Veto**: a protected-list match zeroes the score and forces grade `keep`. No positive signal can override it.

### Why not a static blacklist?

A blacklist has two fatal flaws: it does not transfer (a list for model A may kill a critical component on model B) and it cannot explain itself. BloatLens replaces boolean matching with a *signal + evidence + cost* triple, handing the decision — and the reasoning — back to you.

### Tech choices

| Choice | Why |
| --- | --- |
| **Strict TypeScript** | The failure mode here is a bricked device; type safety removes a whole class of mistakes |
| **Zero runtime deps** | Smallest supply-chain surface; runs via `npx`; ready in CI within seconds |
| **Node's built-in `node:test`** | No test framework dependency — consistent with the zero-dep goal |
| **Plain-text snapshots** | Diffable, archivable, reviewable, and offline by nature |
| **`execFile` with an args array** | No shell string concatenation, so no command injection |

### Roadmap

- [ ] 🧩 **Per-brand rule packs** with conflict detection
- [ ] 📈 **Snapshot diff** — what got re-enabled between two runs
- [ ] 🖥️ **Interactive TUI** for ticking packages in the terminal
- [ ] 🧪 **Synthetic device replay** for regression tests and teaching
- [ ] 🔌 **MCP server** exposing audit capability to AI agents
- [ ] 📦 **Single-file binary distribution**
- [ ] 🌍 **Localised verdict labels**

### How to help

- Contribute rules for hardware you actually own (**please strip serial numbers and account data**)
- Report misclassifications — a package wrongly marked SAFE, or one that was missed
- Improve `dumpsys` parsing (output varies across Android versions)

---

## 📦 Build & Deploy

> **Project type**: BloatLens is a **library / CLI** project. Per the release policy it ships **no Release assets**; the instructions below cover install, import and integration.

### Local build

```bash
git clone https://github.com/gitstq/BloatLens.git
cd BloatLens
npm install          # typescript and @types/node only (devDependencies)
npm run build        # compile to dist/
npm test             # 69 unit tests
npm run smoke        # 23 end-to-end checks
```

### Layout

```
BloatLens/
├── src/
│   ├── index.ts          # library entry
│   ├── cli.ts            # CLI entry
│   ├── types.ts          # type definitions
│   ├── dump.ts           # adb output parser + brand profiling
│   ├── revdep.ts         # reverse dependency graph & blast radius
│   ├── risk.ts           # scoring engine
│   ├── plan.ts           # plan orchestration & reversibility check
│   ├── report.ts         # four report renderers
│   ├── adb.ts            # adb wrapper (injectable runner)
│   └── data/
│       ├── rules.ts      # 23 built-in rules + protected list
│       └── sample.ts     # synthetic sample
├── tests/                # 69 unit tests
├── scripts/smoke.ts      # end-to-end smoke test
└── examples/             # sample snapshots and a demo report
```

### Publish to npm

```bash
npm run build
npm publish --access public
```

`files` is limited to `dist` plus docs, so sources and fixtures stay out of the tarball.

### Integration

```js
const { evaluate } = require('bloatlens');
const { verdicts } = evaluate(snapshot);
const risky = verdicts.filter((v) => v.grade === 'safe' && !v.protected);
if (risky.length > 0) { /* alert or block */ }
```

### Compatibility

| Environment | Status |
| --- | --- |
| Node.js 18 / 20 / 22 | ✅ fully supported |
| Windows 10+ / macOS 12+ / Linux | ✅ cross-platform (paths and line endings normalised) |
| Android 8.0 (API 26) – Android 14 (API 34) | ✅ `pm disable-user` has existed since API 21 |
| Non-rooted devices | ✅ fully supported (root is never required) |
| Air-gapped environments | ✅ fully supported |

### FAQ

<details>
<summary><b>Nothing was recommended for disabling. Why?</b></summary>

Likely causes: ① no `getprop.txt`, so the brand profile is `unknown` and brand rules never fire; ② no `dumpsys.txt`, so the dependency graph is empty and blast radius is over-estimated; ③ threshold too high — try `--safe-threshold 55`.
</details>

<details>
<summary><b>`scan` says adb is missing</b></summary>

BloatLens does not bundle adb. Install [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) and put it on your `PATH`, or use offline mode (`pm list packages -f > packages.txt`, then `bloatlens audit`).
</details>

<details>
<summary><b>Something broke after applying</b></summary>

Run `sh myplan.restore.sh`. It is idempotent, so repeating it is harmless. In the worst case (no launcher), recover a single package with `adb shell pm enable <package>`.
</details>

<details>
<summary><b>Does it upload my device data?</b></summary>

No. There are no network calls at all, `dependencies` is empty, and snapshots stay on disk. The bundled sample is synthetic and contains no real device information.
</details>

---

## 🤝 Contributing

Contributions of any size are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

### Commit convention (Angular)

```bash
feat: add TCL brand rule set
fix: parse multi-line usesLibraries in dumpsys
docs: add English usage examples
refactor: split scoring engine from rule matching
test: add blast radius edge cases
chore: bump typescript to 5.7
```

### Flow

1. 🍴 Fork and branch (`feat/xxx` or `fix/xxx`)
2. 🧪 Write code and tests; keep `npm test` and `npm run smoke` green
3. 📝 If rules changed, update the rule tables in all three READMEs
4. 🔒 **Make sure no serial numbers, accounts or personal data end up in the commit**
5. 📤 Open a PR describing the motivation, the change and how you verified it

### Issues

- 🐛 Bugs: attach **redacted** `packages.txt` and `getprop.txt`, plus BloatLens and Node versions
- 💡 Ideas: describe the scenario and expected behaviour
- ❓ Questions: check the FAQ first

---

## 📄 License

Released under the **[MIT License](./LICENSE)**.

```
Copyright (c) 2026 gitstq
```

**Disclaimer**: This tool is provided "as is". It is not responsible for device malfunction, data loss or warranty voiding. Always back up and make sure you understand every command before running it.

---

<div align="center">

**🔍 BloatLens** — measure the cost before you make the call.

Made with ❤️ by [gitstq](https://github.com/gitstq)

</div>

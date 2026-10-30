<div align="center">

# 🔍 BloatLens

**零依赖 · 离线优先的 Android / Android TV 臃肿软件审计与可逆清理编排引擎**

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md)

![zero-dependency](https://img.shields.io/badge/dependencies-0-3fb950?style=flat-square)
![node](https://img.shields.io/badge/node-%3E%3D18-3fb950?style=flat-square&logo=node.js)
![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![offline](https://img.shields.io/badge/network-not%20required-blueviolet?style=flat-square)
![typescript](https://img.shields.io/badge/typescript-strict-3178c6?style=flat-square&logo=typescript)

</div>

---

## 🎉 项目介绍

你的 Android TV 买回家第一天，就已经在往厂商服务器回传数据了。

开机有广告位、首页有推广内容行、后台常驻着遥测与崩溃上报服务——它们大多**无法卸载**，因为被烧进了 `/system/priv-app`。想清掉它们，通常只剩两条路：root（失去保修与 OTA），或者对着网上流传的包名清单逐个 `adb shell pm disable-user`（不知道自己在禁用什么，也不知道会不会把遥控器或桌面搞挂）。

**BloatLens 就是为这件事而生的第三选项。**

它不是又一份"包名黑名单"，而是一个**确定性的风险评估引擎**：读取设备快照，为每一个包计算加权风险分、反向依赖爆炸半径与可解释的证据链，然后输出一份**每一条都可撤销**的清理计划。

### 它解决了什么痛点

| 😖 现状 | ✅ BloatLens |
| --- | --- |
| 网上流传的包名清单不知道从哪来、适不适合你的机型 | 由 `getprop` 自动推断品牌画像，加载对应规则集，并按分区/命名空间/权限逐项打分 |
| 照抄清单禁用后，遥控器失灵、投屏失效、桌面打不开 | **反向依赖爆炸半径**：先算出"谁需要它"，再决定能不能禁 |
| 禁用之后想恢复，得靠记忆或翻历史命令 | 每条动作**同步生成**幂等的 `restore.sh`，`sh restore.sh` 一键回滚 |
| 想先评估风险，却必须连着设备才能操作 | **纯离线审计**：只要有 `pm list packages -f` 的文本，就能出完整报告 |
| 工具本身装了一堆依赖，在 CI 里跑不起来 | **零运行时依赖**，`npx bloatlens` 即用，可直接作为 CI 门禁 |

### 灵感来源与自研边界

本项目的产品灵感来自 Android TV 去臃肿化这一真实需求方向（近期社区热议话题）。**BloatLens 未复制、未参考任何现有项目的源码或私有数据**，规则库全部由公开可查的 Android 包名命名惯例归纳而来，评分模型、依赖图算法与撤销机制均为独立设计实现。

### 与同类思路的关键差异

| 维度 | 传统"包名清单"做法 | **BloatLens（自研）** |
| --- | --- | --- |
| 决策方式 | 静态匹配，命中即禁用 | **多信号加权评分** + 反向依赖惩罚，输出连续分值而非布尔值 |
| 安全性 | 依赖清单作者的经验 | **保护名单一票否决** + 爆炸半径量化禁用代价 |
| 可解释性 | 无 | 每个结论都给出命中的规则 ID、权重与证据文本 |
| 可逆性 | 需要自己记命令 | **计划即脚本**：apply / restore 成对生成，幂等可重复执行 |
| 运行条件 | 需连接设备 | **离线可用**，支持纯文本快照审计 |
| 集成能力 | 手工操作 | JSON / Markdown / HTML 报告 + 语义化退出码，天然适配 CI |

---

## ✨ 核心特性

- 🧠 **多信号风险评分引擎** —— 遥测、广告、推广、OTA、厂商命名空间、分区、敏感权限、开机自启共 **8 大类 23 条内置规则**叠加打分，输出 `0-100` 连续分值而非简单黑白名单。
- 🔗 **反向依赖爆炸半径** —— 从 `sharedUserId`、`uses-library` 与内置系统耦合表构建依赖图，BFS 计算传递影响面，**在禁用前告诉你代价**（`blastRadius`）。
- 🛡️ **保护名单一票否决** —— 系统界面、设置、GMS、桌面、内容提供者等 15 类关键组件**永不被建议禁用**，任何信号都无法推翻。
- 🔍 **交叉印证加成（synergy）** —— 「厂商命名空间 + 特征词根 + 预装分区」三者同时成立时给予额外置信加成，显著降低误判率。
- ↩️ **可逆性优先设计** —— 每条动作自带撤销命令，计划生成时同步产出**幂等**的 `restore.sh`，并在返回前做完整可逆性校验。
- 📴 **完全离线** —— 不联网、不调用任何 API、不上传任何数据；设备快照只是本地文本文件。
- 🎯 **品牌画像自动推断** —— 解析 `getprop` 得到品牌/型号/TV 形态/Android 版本，并给出推断证据链。
- 📊 **四种报告格式** —— 终端（带色彩）、JSON（CI 消费）、Markdown（贴 PR）、**自包含 HTML**（内联 CSS，双击即开）。
- 🚦 **CI 门禁就绪** —— `--fail-on safe|caution|risky` 语义化退出码，`0` 通过 / `2` 不可逆 / `3` 命中门禁。
- 🧩 **零运行时依赖** —— 纯 TypeScript 严格模式实现，`dependencies` 字段为空。
- 🔌 **库与 CLI 双形态** —— 既可直接 `npx` 使用，也可 `require('bloatlens')` 嵌入你自己的流水线。
- 🌐 **多语言文档** —— 简体中文 / 繁體中文 / English 三语 README，顶部一键切换。

---

## 🚀 快速开始

### 环境要求

| 项目 | 要求 |
| --- | --- |
| **Node.js** | `>= 18`（推荐 20 LTS 或更高） |
| **adb**（可选） | 仅 `scan` 命令需要；离线审计完全不需要 |
| **操作系统** | Windows / macOS / Linux 全平台 |
| **网络** | **不需要** |

### 一键体验（无需设备、无需联网）

```bash
npx bloatlens demo
```

会用内置合成样本（模拟一台 Sony BRAVIA Android TV）跑完整流程，输出风险评估、清理计划与 restore 脚本预览。

### 安装

```bash
# 方式一：npx 直接运行（推荐，无需安装）
npx bloatlens --help

# 方式二：全局安装
npm install -g bloatlens
bloatlens --help

# 方式三：作为库集成
npm install bloatlens
```

### 三分钟清理你的电视（真实设备）

```bash
# ① 电视端：设置 → 设备偏好设置 → 关于 → 连击"版本号"开启开发者选项
#    再进入 开发者选项 → 打开 USB 调试
# ② 电脑端连接同一 WiFi，用电视 IP 连接（端口通常为 5555）
adb connect 192.168.1.20:5555
adb devices                       # 确认设备已在列表中

# ③ 扫描并生成报告
npx bloatlens scan --with-dumpsys --format html --out report.html

# ④ 审慎评估后生成清理计划（同时产出 restore 脚本）
npx bloatlens plan --packages packages.txt --getprop getprop.txt --out myplan.json

# ⑤ 先空跑一遍，看清每条命令
sh myplan.apply.sh --dry-run

# ⑥ 确认无误后执行
sh myplan.apply.sh

# ⑦ 后悔了？一键回滚
sh myplan.restore.sh
```

> ⚠️ **安全提示**：BloatLens 默认**只读**，不会改动你的设备。所有写操作都必须由你显式执行生成的脚本。执行前请务必保留 `restore.sh`。

### 作为库使用

```js
const fs = require('node:fs');
const { parseSnapshotFiles, evaluate, buildPlan, render } = require('bloatlens');

// 1) 从 adb 输出文本构造快照（不需要连设备）
const snapshot = parseSnapshotFiles({
  packages: fs.readFileSync('packages.txt', 'utf8'), // adb shell pm list packages -f
  disabled: fs.readFileSync('disabled.txt', 'utf8'), // adb shell pm list packages -d
  getprop: fs.readFileSync('getprop.txt', 'utf8'),   // adb shell getprop
  dumpsys: fs.readFileSync('dumpsys.txt', 'utf8'),   // adb shell dumpsys package
});

// 2) 风险评估：拿到每个包的分数、分级与可解释证据
const { verdicts, graph } = evaluate(snapshot, {
  safeThreshold: 70,
  allowlist: ['com.example.must.keep'],
});

console.log(verdicts[0].package.name, verdicts[0].netScore, verdicts[0].grade);
console.log(verdicts[0].signals); // [{ id, label, weight, evidence }, ...]

// 3) 生成可逆的清理计划
const plan = buildPlan(snapshot, { includeCaution: false });
console.log(plan.reversibility.allReversible); // true
fs.writeFileSync('restore.sh', plan.reversibility.restoreScript);

// 4) 输出任意格式的报告
fs.writeFileSync('report.html', render('html', plan, verdicts));
```

---

## 📖 详细使用指南

### 命令总览

| 命令 | 作用 | 是否需要设备 |
| --- | --- | --- |
| `bloatlens demo` | 用内置合成样本跑完整流程 | ❌ |
| `bloatlens scan` | 通过 adb 扫描真实设备 | ✅ |
| `bloatlens audit` | 从本地快照文件离线审计 | ❌ |
| `bloatlens plan` | 生成清理计划 + apply/restore 脚本 | ❌ |
| `bloatlens explain <pkg>` | 解释某个包的评分依据 | ❌ |
| `bloatlens depends <pkg>` | 查看依赖与爆炸半径 | ❌ |
| `bloatlens rules` | 列出内置规则库 | ❌ |

### ① 采集设备快照

```bash
adb shell pm list packages -f  > packages.txt
adb shell pm list packages -d  > disabled.txt
adb shell getprop              > getprop.txt
adb shell dumpsys package      > dumpsys.txt   # 可选：启用完整依赖图
```

`dumpsys.txt` 是可选的，但**强烈建议提供**——它是 `sharedUserId` 与 `uses-library` 的唯一来源，也是爆炸半径计算的依据。

### ② 离线审计

```bash
bloatlens audit \
  --packages packages.txt \
  --disabled disabled.txt \
  --getprop  getprop.txt \
  --dumpsys  dumpsys.txt \
  --format   html \
  --out      report.html
```

终端输出示例：

```
清理计划
  设备: sony/BRAVIA 4K GB (TV)
  包总数: 25   受保护: 11
  建议禁用(disable-user): 4   挂起(suspend): 0   跳过: 21
  可逆性: 全部可撤销

包名                            分级     net  信号  依赖  结论
────────────────────────────────────────────────────────────────
com.sony.tv.telemetry             SAFE     78     4     -  4 条信号命中，无可观测依赖项，建议禁用
com.sony.tv.adservice             SAFE     74     4     -  4 条信号命中，无可观测依赖项，建议禁用
com.sony.tv.pushsdk            CAUTION     68     6     -  信号命中但证据中等，建议先观察
com.sony.tv.contentrow         CAUTION     59     5     1  信号命中但证据中等，建议先观察
com.android.systemui             KEEP      0     1     -  受保护：系统界面，禁用后无法进入桌面
```

### ③ 理解单个包的判定依据（可解释性）

```bash
bloatlens explain com.sony.tv.telemetry
```

```
📦 com.sony.tv.telemetry
   路径:      /system/priv-app/TelemetrySvc/TelemetrySvc.apk
   分区:      system-priv-app      状态: enabled      预装: 是      自启: 否

   原始分:    78
   爆炸惩罚:  -0
   最终 net:  78  (SAFE)

   命中信号:
     • [telemetry.core] 遥测数据回传服务  (+38)  证据: telemetry
     • [ns.sony] Sony 厂商命名空间  (+10)  证据: com.sony.
     • [partition.preset] 位于 /system/priv-app（特权预装）  (+10)
     • [synergy.vendor-preinstall-bloat] 厂商预装 + 特征词根交叉印证  (+20)

   直接依赖方: 无
   结论: 4 条信号命中，无可观测依赖项，建议禁用
```

### ④ 评估禁用代价（爆炸半径）

```bash
bloatlens depends com.google.android.gms
```

```
🔗 com.google.android.gms
   依赖（它需要的）: com.android.vending, com.google.android.gsf
   直接依赖方（需要它的）: com.android.vending, com.google.android.gsf, com.google.android.tungsten.home
   传递影响范围: 3 个包
   爆炸半径惩罚: 36
   ⚠️  禁用此包影响面较大，建议保持启用。
```

### ⑤ 生成计划与回滚脚本

```bash
bloatlens plan --packages packages.txt --getprop getprop.txt --dumpsys dumpsys.txt --out myplan.json
```

会同时产出三个文件：

| 文件 | 用途 |
| --- | --- |
| `myplan.json` | 完整计划（含所有动作、撤销命令、统计） |
| `myplan.apply.sh` | 执行脚本，支持 `--dry-run` |
| `myplan.restore.sh` | **幂等**回滚脚本，支持 `--dry-run` |

### 常用参数

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--format <fmt>` | `terminal` / `json` / `markdown` / `html` | `terminal` |
| `--out <file>` | 报告写入文件 | stdout |
| `--device <serial>` | 指定 adb 设备序列号 | 默认设备 |
| `--with-dumpsys` | `scan` 时一并抓取 dumpsys | 关闭 |
| `--allow <pkg,...>` | 追加白名单（永不建议禁用） | — |
| `--deny <pkg,...>` | 追加强制清理名单 | — |
| `--include-caution` | 计划中纳入 CAUTION 级（默认仅 SAFE） | 关闭 |
| `--safe-threshold <n>` | SAFE 阈值 | `70` |
| `--caution-threshold <n>` | CAUTION 阈值 | `45` |
| `--no-blast-radius` | 关闭爆炸半径惩罚（不推荐） | 关闭 |
| `--rules <file>` | 加载自定义规则（JSON 数组） | — |
| `--fail-on <grade>` | CI 门禁阈值 | — |
| `--limit <n>` | 终端报告展示条数 | `20` |
| `--no-color` | 关闭 ANSI 颜色 | 关闭 |

### 分级语义

| 分级 | 含义 | 默认动作 |
| --- | --- | --- |
| 🟢 **SAFE** (`net ≥ 70`) | 多信号交叉印证，且无可观测依赖项 | `pm disable-user --user 0` |
| 🟡 **CAUTION** (`45 ≤ net < 70`) | 有信号但证据中等，或存在少量依赖 | 默认跳过；`--include-caution` 时 `pm suspend` |
| 🔴 **RISKY** (`20 ≤ net < 45`) | 信号不足或依赖较多 | 保持启用 |
| ⚪ **KEEP** (`net < 20` / 受保护) | 信号不足、已禁用，或属于强制保护名单 | 保持启用 |

### 自定义规则（可社区共享）

```json
// my-rules.json
[
  {
    "id": "mybrand.telemetry",
    "pattern": "^com\\.mybrand\\.(telemetry|metrics)",
    "category": "telemetry",
    "weight": 35,
    "label": "MyBrand 遥测服务",
    "brands": ["mybrand"]
  },
  {
    "id": "my.protect",
    "pattern": "^com\\.mybrand\\.remote$",
    "category": "bloat-feature",
    "weight": 0,
    "label": "遥控器服务",
    "protect": true
  }
]
```

```bash
bloatlens audit --packages packages.txt --rules my-rules.json
```

### CI / 自动化集成

```yaml
# .github/workflows/bloat-audit.yml
- name: BloatLens 门禁
  run: |
    npx bloatlens audit \
      --packages packages.txt \
      --getprop getprop.txt \
      --format json --out report.json \
      --fail-on safe
```

退出码语义：

| 退出码 | 含义 |
| --- | --- |
| `0` | 通过（未命中门禁） |
| `1` | 执行错误（参数缺失、文件不存在等） |
| `2` | 计划中存在缺失撤销命令的动作 |
| `3` | 命中 `--fail-on` 指定的门禁阈值 |

### 典型使用场景

<details>
<summary>📺 <b>场景一：给新买的 Android TV 做一次体检</b></summary>

```bash
adb connect 192.168.1.20:5555
npx bloatlens scan --with-dumpsys --format html --out tv-report.html
open tv-report.html      # 或双击打开
```
先看报告里 `受保护` 与 `SAFE` 的数量，再决定是否生成计划。
</details>

<details>
<summary>🏢 <b>场景二：批量管理一批同型号设备</b></summary>

```bash
for ip in 192.168.1.{20,21,22,23}; do
  adb connect $ip:5555
  npx bloatlens scan --device $ip:5555 --format json --out "reports/$ip.json"
done
```
同一型号共用一份品牌画像与规则集，结果天然可比。
</details>

<details>
<summary>🔁 <b>场景三：固件升级后重新审计</b></summary>

厂商 OTA 常会重新启用被禁用的组件。升级后重跑一次，BloatLens 会通过 `disabled.txt` 自动识别哪些又被启用了：

```bash
adb shell pm list packages -f > packages-new.txt
adb shell pm list packages -d > disabled-new.txt
npx bloatlens audit --packages packages-new.txt --disabled disabled-new.txt --getprop getprop.txt
```
</details>

<details>
<summary>🧪 <b>场景四：只做研究，不连设备</b></summary>

```bash
npx bloatlens demo                       # 内置合成样本
npx bloatlens rules                      # 查看全部 23 条内置规则
npx bloatlens explain com.sony.tv.adservice
```
</details>

---

## 💡 设计思路与迭代规划

### 设计哲学

1. **只读优先** —— 默认不改动任何设备状态；写操作必须显式执行生成的脚本。
2. **可逆优先** —— 没有撤销路径的动作，就不应该被生成。这是硬性校验，不是建议。
3. **可解释优先** —— 每一个结论都必须能回答"凭什么"，否则用户无法承担决策后果。
4. **离线优先** —— 设备快照是最敏感的数据，它不应该离开你的磁盘。
5. **确定性优先** —— 全程不使用任何 LLM 或随机采样，相同输入必然得到相同输出，可复现、可回归测试。

### 评分模型

```
netScore = clamp( Σ 正向信号权重 − 爆炸半径惩罚 , 0, 100 )
```

**正向信号（8 大类）**

| 类别 | 权重区间 | 说明 |
| --- | --- | --- |
| `telemetry` | 20 – 38 | 遥测、埋点、崩溃上报、日志上传 |
| `advertising` | 18 – 34 | 广告服务、广告标识、归因转化 |
| `bloat-feature` | 12 – 20 | 内容推荐行、合作方预装、推送通道、语音唤醒 |
| `ota` | 12 | 系统更新服务（禁用有代价，权重刻意保守） |
| `vendor-namespace` | 6 – 10 | 厂商命名空间，区分"谁装的" |
| `partition` | 2 – 10 | `/system/priv-app`(10) → `/data/app`(2) |
| `permission` | 10 – 16 | 声明的敏感权限类别数 |
| `autostart` | 7 | 注册 `BOOT_COMPLETED` |

**交叉印证加成**：当「特征词根 + 厂商命名空间 + 预装分区」同时成立时 `+20`。三类独立证据互相印证，误判概率显著下降。

**负向信号（爆炸半径）**

```
penalty = min(100, 直接依赖数 × 12 + 传递依赖数 × 3)
```

依赖证据来自 `sharedUserId`（同 uid 强耦合）、`uses-library`（显式库依赖）与内置系统耦合表（GMS 家族等），BFS 至多 3 层。

**一票否决**：保护名单命中时 `netScore` 直接归零、分级强制 `keep`，任何正向信号都无法推翻。

### 为什么不用静态黑名单？

静态黑名单有两个致命问题：**不可迁移**（A 机型的清单在 B 机型上可能禁掉关键组件）和**不可解释**（你不知道为什么这个包在名单上）。BloatLens 用"信号 + 证据 + 代价"三元组替代布尔匹配，把决策权连同依据一起交还给使用者。

### 技术选型

| 选择 | 原因 |
| --- | --- |
| **TypeScript 严格模式** | 设备管理工具的代价是变砖，类型安全能消除一整类低级错误 |
| **零运行时依赖** | 供应链攻击面最小；`npx` 即可运行；CI 里几秒就绪 |
| **Node 内置 `node:test`** | 不引入测试框架依赖，与零依赖目标一致 |
| **纯文本快照** | 可 diff、可归档、可 code review，且天然离线 |
| **`execFile` 传数组** | 不拼接 shell 字符串，杜绝命令注入 |

### 迭代规划

- [ ] 🧩 **题库化规则包**：按品牌/机型分发社区规则包，并支持规则冲突检测
- [ ] 📈 **快照 diff**：两次快照之间自动对比"被重新启用了什么"
- [ ] 🖥️ **TUI 交互界面**：终端内勾选要禁用的包
- [ ] 🧪 **模拟设备回放**：内置多品牌合成快照，用于回归测试与教学
- [ ] 🔌 **MCP Server**：把审计能力暴露给 AI Agent 调用
- [ ] 📦 **单文件可执行分发**：打包为独立的 `bloatlens` 二进制
- [ ] 🌍 **规则库多语言标签**：按用户语言输出结论文本

### 社区贡献方向

- 补充你手上真实机型的规则（**请务必脱敏**，不要提交序列号或账号信息）
- 报告误判：某个包被错判为 SAFE 或漏判
- 完善 `dumpsys` 解析（不同 Android 版本输出格式有差异）

---

## 📦 打包与部署指南

> **项目类型判定**：BloatLens 属于**工具库 / CLI 类**项目，按发布规范**无需上传 Release 附件**，以下说明安装、引入与集成的完整步骤。

### 本地构建

```bash
git clone https://github.com/gitstq/BloatLens.git
cd BloatLens
npm install          # 仅安装 typescript 与 @types/node（devDependencies）
npm run build        # 编译到 dist/
npm test             # 69 项单元测试
npm run smoke        # 23 项端到端冒烟
```

### 目录结构

```
BloatLens/
├── src/
│   ├── index.ts          # 库入口
│   ├── cli.ts            # CLI 入口
│   ├── types.ts          # 类型定义
│   ├── dump.ts           # adb 输出解析器
│   ├── profile.ts        # （已并入 dump.ts）品牌画像推断
│   ├── revdep.ts         # 反向依赖图与爆炸半径
│   ├── risk.ts           # 风险评分引擎
│   ├── plan.ts           # 计划编排与可逆性校验
│   ├── report.ts         # 四格式报告生成
│   ├── adb.ts            # adb 命令封装（可注入 runner）
│   └── data/
│       ├── rules.ts      # 23 条内置规则 + 保护名单
│       └── sample.ts     # 合成样本
├── tests/                # 69 项单元测试
├── scripts/smoke.ts      # 端到端冒烟
└── examples/             # 示例快照与演示报告
```

### 发布到 npm

```bash
npm run build
npm publish --access public
```

`files` 字段已限定为 `dist` + 文档，不会上传源码与测试数据。

### 集成到你的流水线

```js
// 作为库集成
const { evaluate, buildPlan } = require('bloatlens');
const { verdicts } = evaluate(snapshot);
const risky = verdicts.filter((v) => v.grade === 'safe' && !v.protected);
if (risky.length > 0) { /* 触发告警或阻断 */ }
```

### 兼容环境

| 环境 | 支持情况 |
| --- | --- |
| Node.js 18 / 20 / 22 | ✅ 完全支持 |
| Windows 10+ / macOS 12+ / Linux | ✅ 跨平台（路径与行尾均已归一化处理） |
| Android 8.0 (API 26) – Android 14 (API 34) | ✅ `pm disable-user` 自 API 21 起可用 |
| 无 root 设备 | ✅ 完全支持（本工具不需要 root） |
| 离线环境 | ✅ 完全支持 |

### 注意事项与常见问题

<details>
<summary><b>Q：为什么我的包一个都没被建议禁用？</b></summary>

可能原因：① 未提供 `getprop.txt`，品牌画像为 `unknown`，导致品牌规则未生效；② 未提供 `dumpsys.txt`，依赖图为空使得爆炸半径被高估；③ 阈值偏高，可尝试 `--safe-threshold 55`。
</details>

<details>
<summary><b>Q：`scan` 提示找不到 adb？</b></summary>

BloatLens 不自带 adb。请安装 [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) 并加入 `PATH`，或改用离线模式（先 `pm list packages -f > packages.txt`，再 `bloatlens audit`）。
</details>

<details>
<summary><b>Q：禁用之后出问题怎么办？</b></summary>

执行 `sh myplan.restore.sh` 即可全量回滚。脚本是幂等的，重复执行无害。极端情况下（无法进入桌面）可通过 `adb shell pm enable <包名>` 单独恢复。
</details>

<details>
<summary><b>Q：会上传我的设备信息吗？</b></summary>

不会。BloatLens 无任何网络调用，`dependencies` 为空，快照文件始终留在本地。仓库中的示例数据是合成的，不含任何真实设备信息。
</details>

---

## 🤝 贡献指南

欢迎任何形式的贡献！详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### 提交规范（Angular）

```bash
feat: 新增 TCL 品牌规则集
fix: 修复 dumpsys 多行 usesLibraries 解析
docs: 补充英文文档的使用示例
refactor: 拆分评分引擎与规则匹配逻辑
test: 补充爆炸半径边界用例
chore: 升级 typescript 至 5.7
```

### 贡献流程

1. 🍴 Fork 本仓库并创建分支（`feat/xxx` 或 `fix/xxx`）
2. 🧪 编写代码与测试，**确保 `npm test` 与 `npm run smoke` 全绿**
3. 📝 如涉及规则变更，请同步更新三语 README 中的规则说明
4. 🔒 **确认提交内容不含任何设备序列号、账号或个人隐私信息**
5. 📤 提交 PR，并在描述中说明动机、改动与验证方式

### Issue 反馈规则

- 🐛 Bug：请附上**脱敏后**的 `packages.txt` 与 `getprop.txt`、BloatLens 版本、Node 版本
- 💡 建议：说明场景与期望行为
- ❓ 疑问：先查阅本文档的"注意事项与常见问题"

---

## 📄 开源协议

本项目基于 **[MIT License](./LICENSE)** 开源。

```
Copyright (c) 2026 gitstq
```

你可以自由使用、复制、修改、合并、发布、分发、再许可和/或销售本软件的副本，但需保留上述版权声明与许可声明。

**免责声明**：本工具按"原样"提供，不对因使用本工具导致的设备功能异常、数据丢失或保修失效承担任何责任。执行任何清理动作前，请务必备份并确认你理解每条命令的含义。

---

<div align="center">

**🔍 BloatLens** — 先算代价，再下决定。

Made with ❤️ by [gitstq](https://github.com/gitstq)

</div>

<div align="center">

# 🔍 BloatLens

**零依賴 · 離線優先的 Android / Android TV 臃腫軟體稽核與可逆清理編排引擎**

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md)

![zero-dependency](https://img.shields.io/badge/dependencies-0-3fb950?style=flat-square)
![node](https://img.shields.io/badge/node-%3E%3D18-3fb950?style=flat-square&logo=node.js)
![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![offline](https://img.shields.io/badge/network-not%20required-blueviolet?style=flat-square)
![typescript](https://img.shields.io/badge/typescript-strict-3178c6?style=flat-square&logo=typescript)

</div>

---

## 🎉 專案介紹

你的 Android TV 在插上電源的那一刻，就已經開始把資料往廠商伺服器送了。

開機有廣告版位、首頁有贊助內容列、背景常駐著遙測與崩潰回報服務——而它們絕大多數**無法解除安裝**，因為早已被燒進 `/system/priv-app`。想清掉通常只剩兩條路：root（放棄保固與 OTA），或是照著網路上流傳的包名清單逐條 `adb shell pm disable-user`（不知道自己在停用什麼，也不知道會拖累哪些功能一起掛掉）。

**BloatLens 就是為此而生的第三條路。**

它不是另一份「包名黑名單」，而是一套**確定性的風險評估引擎**：讀取設備快照，為每個套件計算加權風險分、反向依賴爆炸半徑與可解釋的證據鏈，最後輸出一份**每一條都可還原**的清理計畫。

### 它解決了什麼痛點

| 😖 現況 | ✅ BloatLens |
| --- | --- |
| 網路流傳的清單來路不明，也不見得適合你的機型 | 由 `getprop` 自動推斷品牌畫像，載入對應規則集，並依分區／命名空間／權限逐項打分 |
| 照抄清單停用後，遙控器失靈、投放失效、桌面打不開 | **反向依賴爆炸半徑**：先算出「誰需要它」，再決定能不能停 |
| 停用後想還原，只能翻 shell 歷史紀錄 | 每個動作**同步產生**冪等的 `restore.sh`，一行指令完整回滾 |
| 想先評估風險，卻非得連著設備才能操作 | **純離線稽核**：只要有 `pm list packages -f` 的文字檔，就能產出完整報告 |
| 工具本身綁了一堆依賴，在 CI 裡跑不起來 | **零執行時依賴**，`npx bloatlens` 開箱即用，可直接當 CI 閘門 |

### 靈感來源與自研界線

本專案的產品靈感來自 Android TV 去臃腫化這個真實且廣受討論的需求方向。**BloatLens 未複製、未參考任何既有專案的原始碼或私有資料**；規則庫完全由公開可查的 Android 包名命名慣例歸納而來，評分模型、依賴圖演算法與回滾機制皆為獨立設計實作。

### 與「包名清單」做法的關鍵差異

| 面向 | 傳統靜態黑名單 | **BloatLens（自研）** |
| --- | --- | --- |
| 決策方式 | 命中即停用 | **多訊號加權評分**扣掉依賴懲罰，輸出連續分數而非布林值 |
| 安全性 | 取決於清單作者經驗 | **保護名單一票否決** + 爆炸半徑量化停用代價 |
| 可解釋性 | 無 | 每個結論都列出命中的規則 ID、權重與證據文字 |
| 可逆性 | 自己記指令 | **計畫即腳本**：apply / restore 成對產生，冪等可重複執行 |
| 執行條件 | 需連接設備 | **離線可用**，支援純文字快照稽核 |
| 整合能力 | 手工作業 | JSON / Markdown / HTML 報告 + 語意化結束碼，天生適合 CI |

---

## ✨ 核心特色

- 🧠 **多訊號風險評分引擎** —— 遙測、廣告、推廣、OTA、廠商命名空間、分區、敏感權限、開機自啟共 **8 大類 23 條內建規則**疊加計分，輸出 `0-100` 連續分數。
- 🔗 **反向依賴爆炸半徑** —— 由 `sharedUserId`、`uses-library` 與內建系統耦合表建立依賴圖，BFS 計算傳遞影響面，**在停用前先告訴你代價**。
- 🛡️ **保護名單一票否決** —— 系統介面、設定、GMS、桌面、內容提供者等 15 類關鍵元件**永遠不會被建議停用**，任何訊號都無法推翻。
- 🔍 **交叉印證加成（synergy）** —— 「廠商命名空間 + 特徵詞根 + 預載分區」三者同時成立時給予額外置信加成，顯著降低誤判。
- ↩️ **可逆性優先設計** —— 每個動作自帶還原指令，計畫產生時同步輸出**冪等**的 `restore.sh`，並在回傳前完成完整可逆性校驗。
- 📴 **完全離線** —— 不連網、不呼叫任何 API、不上傳任何資料；設備快照就只是本機文字檔。
- 🎯 **品牌畫像自動推斷** —— 解析 `getprop` 取得品牌／型號／TV 形態／Android 版本，並列出推斷證據鏈。
- 📊 **四種報告格式** —— 終端機（含色彩）、JSON（CI 取用）、Markdown（貼 PR）、**自包含 HTML**（內嵌 CSS，點兩下就開）。
- 🚦 **CI 閘門就緒** —— `--fail-on safe|caution|risky` 語意化結束碼：`0` 通過 / `2` 不可逆 / `3` 命中閘門。
- 🧩 **零執行時依賴** —— 純 TypeScript 嚴格模式實作，`dependencies` 欄位為空。
- 🔌 **函式庫與 CLI 雙型態** —— 可直接 `npx` 使用，也能 `require('bloatlens')` 嵌入自有流程。
- 🌐 **多語系文件** —— 簡體中文 / 繁體中文 / English 三語 README，頂部一鍵切換。

---

## 🚀 快速開始

### 環境需求

| 項目 | 需求 |
| --- | --- |
| **Node.js** | `>= 18`（建議 20 LTS 以上） |
| **adb**（選用） | 僅 `scan` 指令需要；離線稽核完全不需要 |
| **作業系統** | Windows / macOS / Linux 全平台 |
| **網路** | **不需要** |

### 一鍵體驗（無需設備、無需連網）

```bash
npx bloatlens demo
```

會以內建合成樣本（模擬一台 Sony BRAVIA Android TV）跑完整流程，輸出風險評估、清理計畫與 restore 腳本預覽。

### 安裝

```bash
# 方式一：npx 直接執行（推薦，免安裝）
npx bloatlens --help

# 方式二：全域安裝
npm install -g bloatlens
bloatlens --help

# 方式三：作為函式庫整合
npm install bloatlens
```

### 三分鐘清理你的電視（真實設備）

```bash
# ① 電視端：設定 → 裝置偏好設定 → 關於 → 連點「版本號碼」開啟開發人員選項
#    再進入 開發人員選項 → 開啟 USB 偵錯
# ② 電腦端連上同一個 Wi-Fi，用電視 IP 連線（連接埠通常為 5555）
adb connect 192.168.1.20:5555
adb devices                       # 確認裝置已在清單中

# ③ 掃描並產生報告
npx bloatlens scan --with-dumpsys --format html --out report.html

# ④ 審慎評估後產生清理計畫（同時產出 restore 腳本）
npx bloatlens plan --packages packages.txt --getprop getprop.txt --out myplan.json

# ⑤ 先空跑一次，看清每一條指令
sh myplan.apply.sh --dry-run

# ⑥ 確認無誤後執行
sh myplan.apply.sh

# ⑦ 後悔了？一鍵回滾
sh myplan.restore.sh
```

> ⚠️ **安全提醒**：BloatLens 預設**唯讀**，不會改動你的設備。所有寫入動作都必須由你明確執行產生的腳本。執行前請務必保留 `restore.sh`。

### 作為函式庫使用

```js
const fs = require('node:fs');
const { parseSnapshotFiles, evaluate, buildPlan, render } = require('bloatlens');

// 1) 從 adb 輸出文字建立快照（不需要連設備）
const snapshot = parseSnapshotFiles({
  packages: fs.readFileSync('packages.txt', 'utf8'), // adb shell pm list packages -f
  disabled: fs.readFileSync('disabled.txt', 'utf8'), // adb shell pm list packages -d
  getprop: fs.readFileSync('getprop.txt', 'utf8'),   // adb shell getprop
  dumpsys: fs.readFileSync('dumpsys.txt', 'utf8'),   // adb shell dumpsys package
});

// 2) 風險評估：取得每個套件的分數、分級與可解釋證據
const { verdicts, graph } = evaluate(snapshot, {
  safeThreshold: 70,
  allowlist: ['com.example.must.keep'],
});

console.log(verdicts[0].package.name, verdicts[0].netScore, verdicts[0].grade);
console.log(verdicts[0].signals); // [{ id, label, weight, evidence }, ...]

// 3) 產生可逆的清理計畫
const plan = buildPlan(snapshot, { includeCaution: false });
console.log(plan.reversibility.allReversible); // true
fs.writeFileSync('restore.sh', plan.reversibility.restoreScript);

// 4) 輸出任意格式的報告
fs.writeFileSync('report.html', render('html', plan, verdicts));
```

---

## 📖 詳細使用指南

### 指令總覽

| 指令 | 用途 | 是否需要設備 |
| --- | --- | --- |
| `bloatlens demo` | 以內建合成樣本跑完整流程 | ❌ |
| `bloatlens scan` | 透過 adb 掃描真實設備 | ✅ |
| `bloatlens audit` | 從本機快照檔案離線稽核 | ❌ |
| `bloatlens plan` | 產生清理計畫 + apply/restore 腳本 | ❌ |
| `bloatlens explain <pkg>` | 解釋某個套件的評分依據 | ❌ |
| `bloatlens depends <pkg>` | 查看依賴與爆炸半徑 | ❌ |
| `bloatlens rules` | 列出內建規則庫 | ❌ |

### ① 採集設備快照

```bash
adb shell pm list packages -f  > packages.txt
adb shell pm list packages -d  > disabled.txt
adb shell getprop              > getprop.txt
adb shell dumpsys package      > dumpsys.txt   # 選用：啟用完整依賴圖
```

`dumpsys.txt` 是選用的，但**強烈建議提供**——它是 `sharedUserId` 與 `uses-library` 的唯一來源，也是爆炸半徑計算的依據。

### ② 離線稽核

```bash
bloatlens audit \
  --packages packages.txt \
  --disabled disabled.txt \
  --getprop  getprop.txt \
  --dumpsys  dumpsys.txt \
  --format   html \
  --out      report.html
```

終端機輸出範例：

```
清理計畫
  設備: sony/BRAVIA 4K GB (TV)
  套件總數: 25   受保護: 11
  建議停用(disable-user): 4   暫停(suspend): 0   跳過: 21
  可逆性: 全部可還原

套件名稱                        分級     net  訊號  依賴  結論
────────────────────────────────────────────────────────────────
com.sony.tv.telemetry             SAFE     78     4     -  4 條訊號命中，無可觀測依賴項，建議停用
com.sony.tv.adservice             SAFE     74     4     -  4 條訊號命中，無可觀測依賴項，建議停用
com.sony.tv.pushsdk            CAUTION     68     6     -  訊號命中但證據中等，建議先觀察
com.sony.tv.contentrow         CAUTION     59     5     1  訊號命中但證據中等，建議先觀察
com.android.systemui             KEEP      0     1     -  受保護：系統介面，停用後無法進入桌面
```

### ③ 理解單一套件的判定依據（可解釋性）

```bash
bloatlens explain com.sony.tv.telemetry
```

```
📦 com.sony.tv.telemetry
   路徑:      /system/priv-app/TelemetrySvc/TelemetrySvc.apk
   分區:      system-priv-app      狀態: enabled      預載: 是      自啟: 否

   原始分:    78
   爆炸懲罰:  -0
   最終 net:  78  (SAFE)

   命中訊號:
     • [telemetry.core] 遙測資料回傳服務  (+38)  證據: telemetry
     • [ns.sony] Sony 廠商命名空間  (+10)  證據: com.sony.
     • [partition.preset] 位於 /system/priv-app（特權預載）  (+10)
     • [synergy.vendor-preinstall-bloat] 廠商預載 + 特徵詞根交叉印證  (+20)

   直接依賴方: 無
   結論: 4 條訊號命中，無可觀測依賴項，建議停用
```

### ④ 評估停用代價（爆炸半徑）

```bash
bloatlens depends com.google.android.gms
```

```
🔗 com.google.android.gms
   依賴（它需要的）: com.android.vending, com.google.android.gsf
   直接依賴方（需要它的）: com.android.vending, com.google.android.gsf, com.google.android.tungsten.home
   傳遞影響範圍: 3 個套件
   爆炸半徑懲罰: 36
   ⚠️  停用此套件影響面較大，建議保持啟用。
```

### ⑤ 產生計畫與回滾腳本

```bash
bloatlens plan --packages packages.txt --getprop getprop.txt --dumpsys dumpsys.txt --out myplan.json
```

會同時產出三個檔案：

| 檔案 | 用途 |
| --- | --- |
| `myplan.json` | 完整計畫（含所有動作、還原指令、統計） |
| `myplan.apply.sh` | 執行腳本，支援 `--dry-run` |
| `myplan.restore.sh` | **冪等**回滾腳本，支援 `--dry-run` |

### 常用參數

| 參數 | 說明 | 預設值 |
| --- | --- | --- |
| `--format <fmt>` | `terminal` / `json` / `markdown` / `html` | `terminal` |
| `--out <file>` | 報告寫入檔案 | stdout |
| `--device <serial>` | 指定 adb 設備序號 | 預設設備 |
| `--with-dumpsys` | `scan` 時一併抓取 dumpsys | 關閉 |
| `--allow <pkg,...>` | 追加白名單（永不建議停用） | — |
| `--deny <pkg,...>` | 追加強制清理名單 | — |
| `--include-caution` | 計畫中納入 CAUTION 級（預設僅 SAFE） | 關閉 |
| `--safe-threshold <n>` | SAFE 門檻 | `70` |
| `--caution-threshold <n>` | CAUTION 門檻 | `45` |
| `--no-blast-radius` | 關閉爆炸半徑懲罰（不建議） | 關閉 |
| `--rules <file>` | 載入自訂規則（JSON 陣列） | — |
| `--fail-on <grade>` | CI 閘門門檻 | — |
| `--limit <n>` | 終端報告顯示筆數 | `20` |
| `--no-color` | 關閉 ANSI 色彩 | 關閉 |

### 分級語意

| 分級 | 含義 | 預設動作 |
| --- | --- | --- |
| 🟢 **SAFE** (`net ≥ 70`) | 多訊號交叉印證，且無可觀測依賴項 | `pm disable-user --user 0` |
| 🟡 **CAUTION** (`45 ≤ net < 70`) | 有訊號但證據中等，或存在少量依賴 | 預設跳過；`--include-caution` 時 `pm suspend` |
| 🔴 **RISKY** (`20 ≤ net < 45`) | 訊號不足或依賴較多 | 保持啟用 |
| ⚪ **KEEP** (`net < 20` / 受保護) | 訊號不足、已停用，或屬於強制保護名單 | 保持啟用 |

### 自訂規則（可社群共享）

```json
// my-rules.json
[
  {
    "id": "mybrand.telemetry",
    "pattern": "^com\\.mybrand\\.(telemetry|metrics)",
    "category": "telemetry",
    "weight": 35,
    "label": "MyBrand 遙測服務",
    "brands": ["mybrand"]
  },
  {
    "id": "my.protect",
    "pattern": "^com\\.mybrand\\.remote$",
    "category": "bloat-feature",
    "weight": 0,
    "label": "遙控器服務",
    "protect": true
  }
]
```

```bash
bloatlens audit --packages packages.txt --rules my-rules.json
```

### CI / 自動化整合

```yaml
# .github/workflows/bloat-audit.yml
- name: BloatLens 閘門
  run: |
    npx bloatlens audit \
      --packages packages.txt \
      --getprop getprop.txt \
      --format json --out report.json \
      --fail-on safe
```

結束碼語意：

| 結束碼 | 含義 |
| --- | --- |
| `0` | 通過（未命中閘門） |
| `1` | 執行錯誤（參數缺失、檔案不存在等） |
| `2` | 計畫中存在缺少還原指令的動作 |
| `3` | 命中 `--fail-on` 指定的閘門門檻 |

### 典型使用情境

<details>
<summary>📺 <b>情境一：替剛買的 Android TV 做一次體檢</b></summary>

```bash
adb connect 192.168.1.20:5555
npx bloatlens scan --with-dumpsys --format html --out tv-report.html
open tv-report.html      # 或直接用瀏覽器開啟
```
先看報告中 `受保護` 與 `SAFE` 的數量，再決定是否產生計畫。
</details>

<details>
<summary>🏢 <b>情境二：批次管理一批同型號設備</b></summary>

```bash
for ip in 192.168.1.{20,21,22,23}; do
  adb connect $ip:5555
  npx bloatlens scan --device $ip:5555 --format json --out "reports/$ip.json"
done
```
同型號共用同一份品牌畫像與規則集，結果天然可比。
</details>

<details>
<summary>🔁 <b>情境三：韌體升級後重新稽核</b></summary>

廠商 OTA 常會重新啟用被停用的元件。升級後重跑一次，BloatLens 會透過 `disabled.txt` 自動辨識哪些又被打開了：

```bash
adb shell pm list packages -f > packages-new.txt
adb shell pm list packages -d > disabled-new.txt
npx bloatlens audit --packages packages-new.txt --disabled disabled-new.txt --getprop getprop.txt
```
</details>

<details>
<summary>🧪 <b>情境四：只做研究，不連設備</b></summary>

```bash
npx bloatlens demo                       # 內建合成樣本
npx bloatlens rules                      # 查看全部 23 條內建規則
npx bloatlens explain com.sony.tv.adservice
```
</details>

---

## 💡 設計思路與迭代規劃

### 設計哲學

1. **唯讀優先** —— 預設不改動任何設備狀態；寫入動作必須明確執行產生的腳本。
2. **可逆優先** —— 沒有還原路徑的動作，就不該被產生。這是硬性校驗，不是建議。
3. **可解釋優先** —— 每個結論都必須回答「憑什麼」，否則使用者無從承擔決策後果。
4. **離線優先** —— 設備快照是最敏感的資料，它不該離開你的磁碟。
5. **確定性優先** —— 全程不使用任何 LLM 或隨機取樣，相同輸入必然得到相同輸出，可重現、可做回歸測試。

### 評分模型

```
netScore = clamp( Σ 正向訊號權重 − 爆炸半徑懲罰 , 0, 100 )
```

**正向訊號（8 大類）**

| 類別 | 權重區間 | 說明 |
| --- | --- | --- |
| `telemetry` | 20 – 38 | 遙測、埋點、崩潰回報、日誌上傳 |
| `advertising` | 18 – 34 | 廣告服務、廣告識別碼、歸因轉換 |
| `bloat-feature` | 12 – 20 | 內容推薦列、合作方預載、推送通道、語音喚醒 |
| `ota` | 12 | 系統更新服務（停用有代價，權重刻意保守） |
| `vendor-namespace` | 6 – 10 | 廠商命名空間，區分「誰裝的」 |
| `partition` | 2 – 10 | `/system/priv-app`(10) → `/data/app`(2) |
| `permission` | 10 – 16 | 宣告的敏感權限類別數 |
| `autostart` | 7 | 註冊 `BOOT_COMPLETED` |

**交叉印證加成**：當「特徵詞根 + 廠商命名空間 + 預載分區」同時成立時 `+20`。三類獨立證據互相印證，誤判機率顯著下降。

**負向訊號（爆炸半徑）**

```
penalty = min(100, 直接依賴數 × 12 + 傳遞依賴數 × 3)
```

依賴證據來自 `sharedUserId`（同 uid 強耦合）、`uses-library`（顯式函式庫依賴）與內建系統耦合表（GMS 家族等），BFS 最多 3 層。

**一票否決**：命中保護名單時 `netScore` 直接歸零、分級強制 `keep`，任何正向訊號都無法推翻。

### 為什麼不用靜態黑名單？

靜態黑名單有兩個致命問題：**不可遷移**（A 機型的清單在 B 機型上可能停掉關鍵元件）與**不可解釋**（你不知道這個包為什麼在名單上）。BloatLens 以「訊號 + 證據 + 代價」三元組取代布林比對，把決策權連同依據一起交還給使用者。

### 技術選型

| 選擇 | 原因 |
| --- | --- |
| **TypeScript 嚴格模式** | 設備管理工具的代價是變磚，型別安全能消除一整類低級錯誤 |
| **零執行時依賴** | 供應鏈攻擊面最小；`npx` 即可執行；CI 裡幾秒就緒 |
| **Node 內建 `node:test`** | 不引入測試框架依賴，與零依賴目標一致 |
| **純文字快照** | 可 diff、可歸檔、可 code review，且天生離線 |
| **`execFile` 傳陣列** | 不拼接 shell 字串，杜絕指令注入 |

### 迭代規劃

- [ ] 🧩 **規則包化**：依品牌／機型分發社群規則包，並支援規則衝突偵測
- [ ] 📈 **快照 diff**：兩次快照間自動比對「被重新啟用了什麼」
- [ ] 🖥️ **TUI 互動介面**：在終端機內勾選要停用的套件
- [ ] 🧪 **模擬設備回放**：內建多品牌合成快照，用於回歸測試與教學
- [ ] 🔌 **MCP Server**：把稽核能力開放給 AI Agent 呼叫
- [ ] 📦 **單檔可執行分發**：打包為獨立的 `bloatlens` 執行檔
- [ ] 🌍 **規則庫多語系標籤**：依使用者語言輸出結論文字

### 社群貢獻方向

- 補充你手上真實機型的規則（**請務必去識別化**，不要提交序號或帳號資訊）
- 回報誤判：某個套件被錯判為 SAFE 或漏判
- 完善 `dumpsys` 解析（不同 Android 版本輸出格式有差異）

---

## 📦 打包與部署指南

> **專案類型判定**：BloatLens 屬於**工具庫 / CLI 類**專案，依發布規範**無需上傳 Release 附件**，以下說明安裝、引入與整合的完整步驟。

### 本機建置

```bash
git clone https://github.com/gitstq/BloatLens.git
cd BloatLens
npm install          # 僅安裝 typescript 與 @types/node（devDependencies）
npm run build        # 編譯至 dist/
npm test             # 69 項單元測試
npm run smoke        # 23 項端到端冒煙測試
```

### 目錄結構

```
BloatLens/
├── src/
│   ├── index.ts          # 函式庫入口
│   ├── cli.ts            # CLI 入口
│   ├── types.ts          # 型別定義
│   ├── dump.ts           # adb 輸出解析器 + 品牌畫像推斷
│   ├── revdep.ts         # 反向依賴圖與爆炸半徑
│   ├── risk.ts           # 風險評分引擎
│   ├── plan.ts           # 計畫編排與可逆性校驗
│   ├── report.ts         # 四格式報告產生
│   ├── adb.ts            # adb 指令封裝（可注入 runner）
│   └── data/
│       ├── rules.ts      # 23 條內建規則 + 保護名單
│       └── sample.ts     # 合成樣本
├── tests/                # 69 項單元測試
├── scripts/smoke.ts      # 端到端冒煙測試
└── examples/             # 範例快照與示範報告
```

### 發布至 npm

```bash
npm run build
npm publish --access public
```

`files` 欄位已限定為 `dist` + 文件，不會上傳原始碼與測試資料。

### 整合進你的流程

```js
// 作為函式庫整合
const { evaluate } = require('bloatlens');
const { verdicts } = evaluate(snapshot);
const risky = verdicts.filter((v) => v.grade === 'safe' && !v.protected);
if (risky.length > 0) { /* 觸發告警或阻斷 */ }
```

### 相容環境

| 環境 | 支援情況 |
| --- | --- |
| Node.js 18 / 20 / 22 | ✅ 完整支援 |
| Windows 10+ / macOS 12+ / Linux | ✅ 跨平台（路徑與換行皆已正規化處理） |
| Android 8.0 (API 26) – Android 14 (API 34) | ✅ `pm disable-user` 自 API 21 起可用 |
| 未 root 設備 | ✅ 完整支援（本工具不需要 root） |
| 離線環境 | ✅ 完整支援 |

### 注意事項與常見問題

<details>
<summary><b>Q：為什麼我的套件一個都沒被建議停用？</b></summary>

可能原因：① 未提供 `getprop.txt`，品牌畫像為 `unknown`，導致品牌規則未生效；② 未提供 `dumpsys.txt`，依賴圖為空使得爆炸半徑被高估；③ 門檻偏高，可嘗試 `--safe-threshold 55`。
</details>

<details>
<summary><b>Q：`scan` 提示找不到 adb？</b></summary>

BloatLens 不內附 adb。請安裝 [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) 並加入 `PATH`，或改用離線模式（先 `pm list packages -f > packages.txt`，再執行 `bloatlens audit`）。
</details>

<details>
<summary><b>Q：停用之後出問題怎麼辦？</b></summary>

執行 `sh myplan.restore.sh` 即可全量回滾。腳本是冪等的，重複執行無害。極端情況下（無法進入桌面）可透過 `adb shell pm enable <包名>` 單獨還原。
</details>

<details>
<summary><b>Q：會上傳我的設備資訊嗎？</b></summary>

不會。BloatLens 沒有任何網路呼叫，`dependencies` 為空，快照檔案始終留在本機。倉庫中的範例資料是合成的，不含任何真實設備資訊。
</details>

---

## 🤝 貢獻指南

歡迎任何形式的貢獻！詳見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### 提交規範（Angular）

```bash
feat: 新增 TCL 品牌規則集
fix: 修復 dumpsys 多行 usesLibraries 解析
docs: 補充英文文件的使用範例
refactor: 拆分評分引擎與規則比對邏輯
test: 補充爆炸半徑邊界案例
chore: 升級 typescript 至 5.7
```

### 貢獻流程

1. 🍴 Fork 本倉庫並建立分支（`feat/xxx` 或 `fix/xxx`）
2. 🧪 撰寫程式碼與測試，**確保 `npm test` 與 `npm run smoke` 全綠**
3. 📝 若涉及規則變更，請同步更新三語 README 中的規則說明
4. 🔒 **確認提交內容不含任何設備序號、帳號或個人隱私資訊**
5. 📤 提交 PR，並於描述中說明動機、改動與驗證方式

### Issue 回饋規則

- 🐛 Bug：請附上**去識別化後**的 `packages.txt` 與 `getprop.txt`、BloatLens 版本、Node 版本
- 💡 建議：說明情境與期望行為
- ❓ 疑問：先查閱本文的「注意事項與常見問題」

---

## 📄 開源協議

本專案基於 **[MIT License](./LICENSE)** 開源。

```
Copyright (c) 2026 gitstq
```

你可以自由使用、複製、修改、合併、發布、散布、再授權和／或販售本軟體的副本，但需保留上述版權聲明與許可聲明。

**免責聲明**：本工具依「現況」提供，不對因使用本工具導致的設備功能異常、資料遺失或保固失效承擔任何責任。執行任何清理動作前，請務必備份並確認你理解每條指令的含義。

---

<div align="center">

**🔍 BloatLens** — 先算代價，再下決定。

Made with ❤️ by [gitstq](https://github.com/gitstq)

</div>

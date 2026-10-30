# 🤝 贡献指南 / Contributing

感谢你愿意为 BloatLens 贡献一份力量！这是一份设备管理工具，出错的代价可能是「电视变砖」，所以我们对代码质量的要求会稍高一些——但流程本身很简单。

---

## 🚀 快速开始

```bash
git clone https://github.com/gitstq/BloatLens.git
cd BloatLens
npm install        # 只安装 typescript 与 @types/node
npm run build      # 编译到 dist/
npm test           # 69 项单元测试
npm run smoke      # 23 项端到端冒烟测试
```

提交前请确保 `npm test` 与 `npm run smoke` **全部通过**。

---

## 🧭 你可以贡献什么

| 类型 | 说明 |
| --- | --- |
| 🧩 **规则库** | 补充你手上真实机型的规则（**务必脱敏**） |
| 🐛 **误判报告** | 某个包被错判为 SAFE，或明明是 bloatware 却漏判 |
| 🔧 **解析器改进** | 不同 Android 版本的 `dumpsys` / `getprop` 输出格式差异 |
| 📖 **文档** | 三语 README 的补漏、润色与翻译 |
| 🧪 **测试** | 边界用例、回归用例 |
| 💡 **功能建议** | 请先开 Issue 讨论再动手 |

---

## 🔒 提交前的安全检查（硬性要求）

设备快照属于敏感数据。提交任何内容前，请确认：

- ❌ 不包含设备序列号（serial / IMEI / MAC 地址）
- ❌ 不包含 Google 账号、邮箱或其他个人身份信息
- ❌ 不包含 Wi-Fi 名称与密码
- ❌ 不包含任何 Token、API Key 或私钥
- ✅ `examples/` 下的样本必须是**合成数据**

`npm run smoke` 内置了凭据扫描，会自动拦截上述模式。

---

## 📐 代码规范

### 提交信息（Angular 规范）

```
<type>(<scope>): <subject>
```

| type | 用途 |
| --- | --- |
| `feat` | 新增功能 |
| `fix` | 修复问题 |
| `docs` | 文档更新 |
| `refactor` | 代码重构（不改变行为） |
| `test` | 测试相关 |
| `chore` | 构建 / 依赖 / 工具链 |
| `perf` | 性能优化 |

示例：

```bash
feat(rules): 新增 TCL 品牌规则集
fix(dump): 修复 dumpsys 多行 usesLibraries 解析
docs: 补充英文文档的使用示例
refactor(risk): 拆分评分引擎与规则匹配逻辑
test(revdep): 补充爆炸半径边界用例
chore: 升级 typescript 至 5.7
```

### 编码要求

1. **零运行时依赖** —— 不得向 `dependencies` 添加任何包。开发工具只能放进 `devDependencies`。
2. **TypeScript 严格模式** —— 禁止 `any`，禁止绕过类型检查的断言。
3. **纯函数优先** —— 解析器与评分引擎必须是纯函数：相同输入必然得到相同输出。这是「可复现」承诺的基础。
4. **可解释性** —— 新增的任何信号都必须带 `id`、`label`、`weight` 与 `evidence`，否则无法在 `explain` 中展示。
5. **可逆性** —— 任何新的动作类型都必须同时提供撤销命令，并通过 `checkReversibility`。
6. **跨平台** —— 路径比较前先归一化分隔符，读取文本时兼容 `\r\n` 与 `\n`。

### 测试要求

| 改动类型 | 要求 |
| --- | --- |
| 新增规则 | 至少 1 条命中用例 + 1 条不误伤用例 |
| 修改解析器 | 至少 1 条解析用例，含边界输入（空行、畸形行） |
| 修改评分逻辑 | 补充排序 / 阈值 / 惩罚相关的断言 |
| 新增 CLI 命令 | 在 `scripts/smoke.ts` 中补一条冒烟检查 |

---

## 📋 Pull Request 流程

1. 🍴 Fork 仓库，从 `main` 切出分支：`feat/xxx` 或 `fix/xxx`
2. ✍️ 编写代码与测试
3. ✅ 本地验证：`npm test` + `npm run smoke` 全绿
4. 📝 若改动涉及规则表或命令参数，同步更新**三语 README**（简中 / 繁中 / English）
5. 🔒 自查安全清单（见上文）
6. 📤 提交 PR，描述中请包含：
   - **动机**：解决什么问题
   - **改动**：改了什么、为什么这样改
   - **验证**：跑了哪些测试、在什么环境下验证

### PR 标题格式

与提交规范一致，例如：`feat(rules): 新增海信品牌规则集`

---

## 🐛 Issue 规范

**Bug 报告**请包含：

```
BloatLens 版本：1.0.0
Node 版本：v22.13.1
操作系统：Ubuntu 22.04
设备：品牌 / 型号 / Android 版本

预期行为：
实际行为：
复现步骤：
附件（务必脱敏）：packages.txt / getprop.txt
```

**误判报告**请包含：包名、所在分区、你期望的分级、以及理由（例如"这个包是遥控器配对服务"）。

---

## 🧩 新增规则的最小示例

```ts
// src/data/rules.ts
{
  id: 'brand.telemetry',          // 稳定 ID，会显示在 explain 输出中
  pattern: '^com\\.brand\\.(telemetry|metrics)',
  category: 'telemetry',          // 必须是 8 个既定类别之一
  weight: 35,                     // 0-40，见 README 的权重表
  label: 'Brand 遥测服务',        // 会显示在报告中
  brands: ['brand'],              // 可选：限定品牌
  tvOnly: false,                  // 可选：仅 TV 生效
  protect: false,                 // 可选：true 表示强制保护
}
```

配套测试：

```ts
test('Brand 遥测规则命中', () => {
  const signals = collectSignals(pkg('com.brand.telemetry'), { brand: 'brand', isTv: true, rules: BUILTIN_RULES });
  assert.ok(signals.some((s) => s.id === 'brand.telemetry'));
});
```

---

## 🙏 行为准则

- 保持友善与专业，对事不对人
- 讨论技术取舍时请给出依据，而非偏好
- 对新手提问保持耐心

---

再次感谢你的贡献！🔍

/**
 * BloatLens 公共类型定义
 *
 * 全部类型均为纯数据结构，不依赖任何第三方库，便于在 Node、浏览器与测试环境中复用。
 */

/** 包所在的系统分区，决定其"预装"程度与禁用代价 */
export type Partition =
  | 'system-priv-app'
  | 'system-app'
  | 'system-framework'
  | 'vendor-app'
  | 'product-app'
  | 'system-ext-app'
  | 'oem-app'
  | 'data-app'
  | 'unknown';

/** 包的安装/启用状态 */
export type PackageState = 'enabled' | 'disabled' | 'uninstalled' | 'unknown';

/** 设备画像：由 getprop 推断出的品牌与形态 */
export interface DeviceProfile {
  /** 推断出的品牌标识，例如 sony / xiaomi / tcl / hisense / google */
  brand: string;
  manufacturer: string;
  model: string;
  device: string;
  /** 设备形态，tv / phone / tablet / unknown */
  formFactor: 'tv' | 'phone' | 'tablet' | 'unknown';
  /** Android 大版本，解析失败为 null */
  androidApi: number | null;
  /** 是否判定为 Android TV / Google TV 类设备 */
  isTv: boolean;
  /** 推断该画像时命中的证据，用于可解释性输出 */
  evidence: string[];
}

/** 单个已安装包的快照 */
export interface PackageInfo {
  /** 完整包名 */
  name: string;
  /** APK 路径，来自 `pm list packages -f` */
  path: string;
  partition: Partition;
  state: PackageState;
  /** 是否为系统签名（system signature） */
  systemSigned: boolean;
  /** 是否为预装包（非用户后装） */
  preinstalled: boolean;
  /** 声明的敏感权限列表（已归一化为保护组名） */
  permissions: string[];
  /** 声明的 uses-library 列表 */
  usesLibraries: string[];
  /** sharedUserId，同 uid 的包之间存在运行时耦合 */
  sharedUserId: string | null;
  /** 是否注册了开机自启类接收器 */
  autostart: boolean;
  /** 版本信息（可选） */
  versionName?: string;
  versionCode?: number;
}

/** 一次完整的设备快照（离线可复现） */
export interface DeviceSnapshot {
  profile: DeviceProfile;
  packages: PackageInfo[];
  /** 快照来源，例如 file / adb / synthetic */
  source: string;
  /** 快照创建时间（ISO 8601） */
  capturedAt: string;
}

/** 命中的单条风险信号 */
export interface RiskSignal {
  /** 信号 ID，稳定可引用 */
  id: string;
  /** 人类可读说明 */
  label: string;
  /** 该信号贡献的原始权重 */
  weight: number;
  /** 命中证据（正则名 / 权限名 / 路径片段等） */
  evidence: string[];
}

/** 风险分级 */
export type RiskGrade = 'safe' | 'caution' | 'risky' | 'keep';

/** 单个包的风险评估结果 */
export interface RiskVerdict {
  package: PackageInfo;
  /** 正向信号加权总分（0-100，clamp 前为 rawScore） */
  score: number;
  /** 反向依赖爆炸半径惩罚（0-100） */
  blastPenalty: number;
  /** score - blastPenalty，clamp 到 0-100 */
  netScore: number;
  grade: RiskGrade;
  /** 是否受保护名单强制保护（永不建议禁用） */
  protected: boolean;
  /** 保护原因 */
  protectedReason: string | null;
  signals: RiskSignal[];
  /** 反向依赖：有哪些存活包依赖它 */
  dependents: string[];
  /** 可解释的一句话结论 */
  reason: string;
}

/** 一次清理计划中的单条动作 */
export interface PlanAction {
  package: string;
  /** 建议动作 */
  action: 'disable-user' | 'disable' | 'suspend' | 'skip';
  grade: RiskGrade;
  netScore: number;
  /** 生成的 adb 命令（可逆） */
  command: string;
  /** 对应的撤销命令 */
  undoCommand: string;
  reason: string;
}

/** 清理计划 */
export interface DebloatPlan {
  /** 计划来源快照摘要 */
  snapshot: {
    brand: string;
    model: string;
    isTv: boolean;
    totalPackages: number;
    capturedAt: string;
  };
  /** 生效的规则集 ID 列表 */
  ruleSets: string[];
  actions: PlanAction[];
  /** 统计 */
  summary: {
    total: number;
    disableUser: number;
    disable: number;
    suspend: number;
    skip: number;
    protectedCount: number;
  };
  /** 可逆性校验结果 */
  reversibility: {
    /** 每条动作是否都具备 undo */
    allReversible: boolean;
    /** 缺失撤销命令的包 */
    missingUndo: string[];
    /** 生成的 restore 脚本（幂等） */
    restoreScript: string;
  };
}

/** 报告输出格式 */
export type ReportFormat = 'terminal' | 'json' | 'markdown' | 'html';

/** 评估配置 */
export interface EvaluateOptions {
  /** 安全阈值：netScore >= 该值且非 protected 才建议禁用 */
  safeThreshold?: number;
  /** 谨慎阈值 */
  cautionThreshold?: number;
  /** 是否把反向依赖惩罚计入 */
  useBlastRadius?: boolean;
  /** 额外保护名单（用户白名单） */
  allowlist?: string[];
  /** 额外必须清理名单（用户黑名单，强制提升到 safe） */
  denylist?: string[];
  /** 额外自定义规则 */
  extraRules?: Rule[];
  /** 是否禁用内置保护名单（不推荐，仅供测试） */
  disableBuiltinProtection?: boolean;
}

/** 自定义规则（支持社区共享） */
export interface Rule {
  id: string;
  /** 作用于包名的正则（字符串形式，便于 JSON 序列化） */
  pattern: string;
  /** 信号分类 */
  category:
    | 'telemetry'
    | 'advertising'
    | 'bloat-feature'
    | 'ota'
    | 'vendor-namespace'
    | 'partition'
    | 'permission'
    | 'autostart';
  /** 权重 */
  weight: number;
  label: string;
  /** 适用品牌，为空表示通用 */
  brands?: string[];
  /** 是否仅 TV 生效 */
  tvOnly?: boolean;
  /** 是否将命中包标记为强制保护 */
  protect?: boolean;
}

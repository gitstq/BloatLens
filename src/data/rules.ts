import type { Rule } from '../types';

/**
 * 内置规则库（自研，基于公开可查的 Android / Android TV 包名命名惯例归纳）
 *
 * 设计原则：
 *  1. 只做「模式归纳」，不内置任何项目的专有数据；
 *  2. 任何命中都只会产生「建议」，保护名单（protect）拥有一票否决权；
 *  3. 全部规则可解释：输出中会给出命中的正则与证据。
 */

/** 遥测 / 数据回传类 */
const TELEMETRY: Rule[] = [
  {
    id: 'telemetry.core',
    pattern: '(telemetry|telemetrics|telemon|metrics|metricagent)',
    category: 'telemetry',
    weight: 38,
    label: '遥测数据回传服务',
  },
  {
    id: 'telemetry.analytics',
    pattern: '(analytics|analyticsservice|usage[-_.]?stats|usagereport)',
    category: 'telemetry',
    weight: 32,
    label: '使用行为统计分析',
  },
  {
    id: 'telemetry.tracking',
    pattern: '(tracking|tracker|track[-_.]?service|beacon|pixel[-_.]?svc)',
    category: 'telemetry',
    weight: 32,
    label: '行为追踪 / 埋点服务',
  },
  {
    id: 'telemetry.crash',
    pattern: '(crashlytics|crashreport|bugreport|bug[-_.]?report|acra|sentry)',
    category: 'telemetry',
    weight: 22,
    label: '崩溃与诊断上报',
  },
  {
    id: 'telemetry.diagnostic',
    pattern: '(diagnostics|diagservice|devicehealth|healthmonitor|qoe)',
    category: 'telemetry',
    weight: 20,
    label: '设备健康 / 质量上报',
  },
  {
    id: 'telemetry.logupload',
    pattern: '(logupload|log[-_.]?collect|logsender|logagent)',
    category: 'telemetry',
    weight: 22,
    label: '日志采集上传',
  },
];

/** 广告 / 推广类 */
const ADVERTISING: Rule[] = [
  {
    id: 'ads.core',
    pattern: '(advertising|adservice|ad[-_.]?provider|admanager|ad[-_.]?sdk)',
    category: 'advertising',
    weight: 34,
    label: '广告服务 / SDK',
  },
  {
    id: 'ads.gms',
    pattern: '(gms\\.ads|doubleclick|admob|adid|advertiserid|ad[-_.]?identity)',
    category: 'advertising',
    weight: 30,
    label: '广告标识符与投放服务',
  },
  {
    id: 'ads.promotion',
    pattern: '(promotion|promo[-_.]?svc|marketing|adpush|ad[-_.]?delivery)',
    category: 'advertising',
    weight: 26,
    label: '营销推送与推广投放',
  },
  {
    id: 'ads.attribution',
    pattern: '(attribution|conversion|deep[-_.]?link[-_.]?svc|referrer)',
    category: 'advertising',
    weight: 18,
    label: '广告归因与转化统计',
  },
];

/** 厂商预装功能 / 内容推荐类 */
const BLOAT_FEATURE: Rule[] = [
  {
    id: 'bloat.contentrow',
    pattern: '(contentrow|content[-_.]?discovery|homepanel|channelrow|recommend)',
    category: 'bloat-feature',
    weight: 20,
    label: '首页内容推荐行',
  },
  {
    id: 'bloat.partner',
    pattern: '(partner[-_.]?app|partnerhub|carrier[-_.]?app|operator[-_.]?app)',
    category: 'bloat-feature',
    weight: 18,
    label: '运营商 / 合作方预装',
  },
  {
    id: 'bloat.preload',
    pattern: '(preload|preinstall|pre[-_.]?bundled|bundledapp)',
    category: 'bloat-feature',
    weight: 16,
    label: '预装 / 捆绑分发应用',
  },
  {
    id: 'bloat.ott',
    pattern: '(ott[-_.]?svc|ottclient|video[-_.]?portal|tv[-_.]?portal|media[-_.]?portal)',
    category: 'bloat-feature',
    weight: 14,
    label: '厂商自有内容门户',
  },
  {
    id: 'bloat.pushsdk',
    pattern: '(pushsdk|push[-_.]?service|pushclient|mipush|hms[-_.]?push|fcm[-_.]?relay)',
    category: 'bloat-feature',
    weight: 12,
    label: '厂商推送通道',
  },
  {
    id: 'bloat.assistant',
    pattern: '(voice[-_.]?assist|far[-_.]?field|voiceservice|wakeup[-_.]?svc)',
    category: 'bloat-feature',
    weight: 12,
    label: '常驻语音唤醒服务',
  },
];

/** OTA / 系统更新（禁用有代价，权重适中且默认归入 caution） */
const OTA: Rule[] = [
  {
    id: 'ota.update',
    pattern: '(ota[-_.]?svc|systemupdate|firmware[-_.]?update|fota|systemupgrade)',
    category: 'ota',
    weight: 12,
    label: '系统 OTA 更新服务',
  },
];

/** 厂商命名空间（区分是否为厂商自有预装） */
const VENDOR_NS: Rule[] = [
  {
    id: 'ns.sony',
    pattern: '^com\\.sony\\.',
    category: 'vendor-namespace',
    weight: 10,
    label: 'Sony 厂商命名空间',
    brands: ['sony'],
  },
  {
    id: 'ns.xiaomi',
    pattern: '^(com\\.(xiaomi|miui))\\.',
    category: 'vendor-namespace',
    weight: 10,
    label: '小米 / MIUI 厂商命名空间',
    brands: ['xiaomi'],
  },
  {
    id: 'ns.tcl',
    pattern: '^com\\.(tcl|tct)\\.' ,
    category: 'vendor-namespace',
    weight: 10,
    label: 'TCL 厂商命名空间',
    brands: ['tcl'],
  },
  {
    id: 'ns.hisense',
    pattern: '^com\\.hisense\\.',
    category: 'vendor-namespace',
    weight: 10,
    label: '海信厂商命名空间',
    brands: ['hisense'],
  },
  {
    id: 'ns.amazon',
    pattern: '^com\\.amazon\\.',
    category: 'vendor-namespace',
    weight: 10,
    label: 'Amazon 厂商命名空间',
    brands: ['amazon'],
  },
  {
    id: 'ns.nvidia',
    pattern: '^com\\.nvidia\\.',
    category: 'vendor-namespace',
    weight: 8,
    label: 'NVIDIA 厂商命名空间',
    brands: ['nvidia'],
  },
  {
    id: 'ns.philips',
    pattern: '^com\\.(philips|tpvision)\\.',
    category: 'vendor-namespace',
    weight: 10,
    label: 'Philips / TP Vision 命名空间',
    brands: ['philips'],
  },
  {
    id: 'ns.thirdparty',
    pattern: '^(?!com\\.(android|google|qualcomm|mediatek|samsung|sony|xiaomi|miui|tcl|tct|hisense|amazon|nvidia|philips|tpvision)\\.)[a-z0-9_]+(\\.[a-z0-9_]+)+$',
    category: 'vendor-namespace',
    weight: 6,
    label: '第三方厂商 / ODM 命名空间',
  },
];

/** 开机自启（由 dump 中的 receiver 推断，此处作为分类占位） */
const AUTOSTART: Rule[] = [
  {
    id: 'autostart.boot',
    pattern: '^__autostart__$',
    category: 'autostart',
    weight: 7,
    label: '注册开机自启接收器',
  },
];

/** 内置规则全集 */
export const BUILTIN_RULES: Rule[] = [
  ...TELEMETRY,
  ...ADVERTISING,
  ...BLOAT_FEATURE,
  ...OTA,
  ...VENDOR_NS,
  ...AUTOSTART,
];

/**
 * 强制保护名单：命中即永不建议禁用。
 *
 * 这些组件一旦被禁用，会导致设备无法启动、无法进入桌面、无法联网或无法恢复，
 * 属于「禁用代价无限大」的范畴。BloatLens 对其拥有一票否决权。
 */
export const PROTECTED_PATTERNS: Array<{ pattern: string; reason: string }> = [
  { pattern: '^com\\.android\\.systemui$', reason: '系统界面，禁用后无法进入桌面' },
  { pattern: '^com\\.android\\.settings$', reason: '系统设置，禁用后无法恢复任何配置' },
  { pattern: '^com\\.android\\.shell$', reason: 'shell 主体，ADB 与权限体系依赖' },
  { pattern: '^android$', reason: 'Android 系统框架共享 ID' },
  { pattern: '^com\\.android\\.providers\\.', reason: '系统内容提供者，禁用会导致数据服务崩溃' },
  { pattern: '^com\\.android\\.server\\.', reason: '系统服务组件' },
  { pattern: '^com\\.android\\.bluetooth$', reason: '蓝牙核心服务，遥控器配对依赖' },
  { pattern: '^com\\.android\\.phone$', reason: '电话核心服务' },
  { pattern: '^com\\.android\\.inputmethod\\.', reason: '输入法服务，禁用后无法输入' },
  { pattern: '^com\\.google\\.android\\.gms$', reason: 'Google Play 服务主体，禁用会导致大量应用崩溃' },
  { pattern: '^com\\.google\\.android\\.gsf$', reason: 'Google 服务框架，账号与同步依赖' },
  { pattern: '^com\\.android\\.vending$', reason: 'Play 商店，恢复应用的唯一入口' },
  { pattern: '^com\\.google\\.android\\.tv\\.', reason: 'Android TV 核心服务集合' },
  { pattern: '^com\\.google\\.android\\.tungsten\\.', reason: 'Google TV 界面框架' },
  { pattern: '^com\\.android\\.launcher', reason: '默认桌面（launcher），禁用后无主屏幕' },
  { pattern: '(launcher|launcher3|tvlauncher|home)', reason: '疑似桌面组件，禁用后可能无法进入主页' },
];

/** 内置默认白名单（常见用户主动保留） */
export const DEFAULT_ALLOWLIST: string[] = [
  'com.google.android.gms',
  'com.android.vending',
  'com.google.android.youtube',
  'com.netflix.ninja',
  'org.videolan.vlc',
];

/** 各品牌默认启用的规则集 ID */
export function ruleSetIds(): string[] {
  return ['builtin/telemetry', 'builtin/advertising', 'builtin/bloat-feature', 'builtin/ota', 'builtin/namespace'];
}

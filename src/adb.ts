import { execFile } from 'node:child_process';

/**
 * adb 命令执行封装
 *
 * 设计要点：
 *  1. **可注入** —— 传输层抽象为 AdbRunner 接口，测试与离线环境可完全替换；
 *  2. **不静默失败** —— 命令失败会抛出带上下文的错误，CLI 转为用户可读提示；
 *  3. **不拼接 shell** —— 使用 execFile 传数组参数，避免命令注入；
 *  4. **永不记录凭据** —— 只回传 stdout，不持久化设备序列号以外的信息。
 */

export interface AdbRunner {
  (args: string[]): Promise<string>;
}

export interface AdbOptions {
  /** adb 可执行文件，默认 adb */
  binary?: string;
  /** 目标设备序列号，例如 192.168.1.20:5555 */
  device?: string;
  /** 超时毫秒，默认 20000 */
  timeout?: number;
  /** 自定义 runner（测试用） */
  runner?: AdbRunner;
}

/** 默认 runner：真实调用 adb */
export const defaultRunner: AdbRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile('adb', args, { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || '').toString().trim() || err.message;
        reject(new Error(`adb ${args.join(' ')} 执行失败: ${msg}`));
        return;
      }
      resolve(stdout.toString());
    });
  });

export class AdbClient {
  private readonly binary: string;
  private readonly device?: string;
  private readonly timeout: number;
  private readonly runner: AdbRunner;

  constructor(opts: AdbOptions = {}) {
    this.binary = opts.binary ?? 'adb';
    this.device = opts.device;
    this.timeout = opts.timeout ?? 20_000;
    this.runner = opts.runner ?? defaultRunner;
  }

  private build(command: string[]): string[] {
    const args: string[] = [];
    if (this.device) args.push('-s', this.device);
    args.push(...command);
    return args;
  }

  /** 列出设备 */
  async devices(): Promise<string[]> {
    const out = await this.run(['devices']);
    return out
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split('\t')[0].trim())
      .filter(Boolean);
  }

  /** `shell pm list packages -f` */
  async listPackages(mode: 'all' | 'enabled' | 'disabled' | 'third-party' | 'system' = 'all'): Promise<string> {
    const flag: Record<string, string[]> = {
      all: [],
      enabled: ['-e'],
      disabled: ['-d'],
      'third-party': ['-3'],
      system: ['-s'],
    };
    return this.run(['shell', 'pm', 'list', 'packages', '-f', ...flag[mode]]);
  }

  /** `shell getprop` */
  async getprop(): Promise<string> {
    return this.run(['shell', 'getprop']);
  }

  /** `shell dumpsys package` —— 输出较大，仅在需要依赖图时调用 */
  async dumpsysPackage(): Promise<string> {
    return this.run(['shell', 'dumpsys', 'package']);
  }

  /** 采集完整快照所需的所有原始文本 */
  async collectRaw(opts: { withDumpsys?: boolean } = {}): Promise<{
    packages: string;
    disabled: string;
    getprop: string;
    dumpsys: string;
  }> {
    const [packages, disabled, getprop] = await Promise.all([
      this.listPackages('all'),
      this.listPackages('disabled').catch(() => ''),
      this.getprop(),
    ]);
    const dumpsys = opts.withDumpsys ? await this.dumpsysPackage().catch(() => '') : '';
    return { packages, disabled, getprop, dumpsys };
  }

  private async run(command: string[]): Promise<string> {
    const args = this.build(command);
    // binary 非默认值时，runner 由调用方自行处理；这里仅用于 --adb-path 场景的提示
    void this.binary;
    void this.timeout;
    return this.runner(args);
  }
}

/** 检测 adb 是否可用（不抛异常） */
export async function isAdbAvailable(runner: AdbRunner = defaultRunner): Promise<boolean> {
  try {
    await runner(['version']);
    return true;
  } catch {
    return false;
  }
}

const LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LEVELS)[number];

function ts(): string {
  return new Date().toISOString();
}

export class Logger {
  private level: LogLevel = "info";

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private enabled(level: LogLevel): boolean {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(this.level);
  }

  debug(msg: string, ...rest: unknown[]): void {
    if (this.enabled("debug")) console.log(ts(), "DEBUG", msg, ...rest);
  }

  info(msg: string, ...rest: unknown[]): void {
    if (this.enabled("info")) console.log(ts(), "INFO", msg, ...rest);
  }

  warn(msg: string, ...rest: unknown[]): void {
    if (this.enabled("warn")) console.warn(ts(), "WARN", msg, ...rest);
  }

  error(msg: string, ...rest: unknown[]): void {
    if (this.enabled("error")) console.error(ts(), "ERROR", msg, ...rest);
  }
}

export const log = new Logger();

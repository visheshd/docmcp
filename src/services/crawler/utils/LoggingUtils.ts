import logger from '../../../utils/logger';

/**
 * Log levels enum
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  NONE = 'none'
}

/**
 * Utilities for logging in the crawler service
 */
export class LoggingUtils {
  private static currentLevel: LogLevel = LogLevel.INFO;
  private static enabledTags: Set<string> = new Set(['crawler', 'http', 'job']);

  /**
   * Sets the current log level
   * @param level The log level to set
   */
  static setLogLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Add a tag to be included in logging
   * @param tag The tag to enable
   */
  static enableTag(tag: string): void {
    this.enabledTags.add(tag.toLowerCase());
  }

  /**
   * Remove a tag from being included in logging
   * @param tag The tag to disable
   */
  static disableTag(tag: string): void {
    this.enabledTags.delete(tag.toLowerCase());
  }

  /**
   * Check if a tag is enabled for logging
   * @param tag The tag to check
   * @returns True if the tag is enabled
   */
  static isTagEnabled(tag: string): boolean {
    return this.enabledTags.has(tag.toLowerCase());
  }

  /**
   * Log a debug message
   * @param message The message to log
   * @param tag Optional tag for filtering
   * @param context Optional context object
   */
  static debug(message: string, tag?: string, context?: object): void {
    this.log(LogLevel.DEBUG, message, tag, context);
  }

  /**
   * Log an info message
   * @param message The message to log
   * @param tag Optional tag for filtering
   * @param context Optional context object
   */
  static info(message: string, tag?: string, context?: object): void {
    this.log(LogLevel.INFO, message, tag, context);
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param tag Optional tag for filtering
   * @param context Optional context object
   */
  static warn(message: string, tag?: string, context?: object): void {
    this.log(LogLevel.WARN, message, tag, context);
  }

  /**
   * Log an error message
   * @param message The message or error to log
   * @param tag Optional tag for filtering
   * @param context Optional context object
   */
  static error(message: string | Error, tag?: string, context?: object): void {
    if (message instanceof Error) {
      this.log(LogLevel.ERROR, message.message, tag, {
        ...context,
        stack: message.stack,
        name: message.name
      });
    } else {
      this.log(LogLevel.ERROR, message, tag, context);
    }
  }

  /**
   * Format and log a message based on level, tag, and context
   * @param level The log level
   * @param message The message to log
   * @param tag Optional tag for filtering
   * @param context Optional context object
   */
  private static log(level: LogLevel, message: string, tag?: string, context?: object): void {
    // Exit early if level is below current or if tag is not enabled
    if (this.isLevelDisabled(level) || (tag && !this.isTagEnabled(tag))) {
      return;
    }

    // Format the message with tag
    const formattedMessage = tag ? `[${tag}] ${message}` : message;
    
    // Log using the main logger with appropriate level and context
    switch (level) {
      case LogLevel.DEBUG:
        logger.debug(formattedMessage, context);
        break;
      case LogLevel.INFO:
        logger.info(formattedMessage, context);
        break;
      case LogLevel.WARN:
        logger.warn(formattedMessage, context);
        break;
      case LogLevel.ERROR:
        logger.error(formattedMessage, context);
        break;
    }
  }

  /**
   * Check if a log level is disabled based on the current level
   * @param level The level to check
   * @returns True if the level is disabled
   */
  private static isLevelDisabled(level: LogLevel): boolean {
    if (this.currentLevel === LogLevel.NONE) {
      return true;
    }

    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.currentLevel);
    const logIndex = levels.indexOf(level);

    return logIndex < currentIndex;
  }

  /**
   * Create a scoped logger with a fixed tag
   * @param tag The tag to scope the logger with
   * @returns An object with logging methods
   */
  static createTaggedLogger(tag: string) {
    return {
      debug: (message: string, context?: object) => this.debug(message, tag, context),
      info: (message: string, context?: object) => this.info(message, tag, context),
      warn: (message: string, context?: object) => this.warn(message, tag, context),
      error: (message: string | Error, context?: object) => this.error(message, tag, context)
    };
  }
} 
import { Injectable, LoggerService } from '@nestjs/common';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

@Injectable()
export class BytebotLogger implements LoggerService {
  private logLevel: LogLevel = LogLevel.INFO;

  constructor() {
    const level = process.env.LOG_LEVEL?.toUpperCase();
    switch (level) {
      case 'ERROR': this.logLevel = LogLevel.ERROR; break;
      case 'WARN': this.logLevel = LogLevel.WARN; break;
      case 'INFO': this.logLevel = LogLevel.INFO; break;
      case 'DEBUG': this.logLevel = LogLevel.DEBUG; break;
    }
  }

  log(message: any, context?: string) {
    this.info(message, context);
  }

  error(message: any, trace?: string, context?: string) {
    if (this.logLevel >= LogLevel.ERROR) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [ERROR] ${context ? `[${context}] ` : ''}${message}`);
      if (trace) console.error(trace);
    }
  }

  warn(message: any, context?: string) {
    if (this.logLevel >= LogLevel.WARN) {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] [WARN] ${context ? `[${context}] ` : ''}${message}`);
    }
  }

  info(message: any, context?: string) {
    if (this.logLevel >= LogLevel.INFO) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [INFO] ${context ? `[${context}] ` : ''}${message}`);
    }
  }

  debug(message: any, context?: string) {
    if (this.logLevel >= LogLevel.DEBUG) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [DEBUG] ${context ? `[${context}] ` : ''}${message}`);
    }
  }

  verbose(message: any, context?: string) {
    this.debug(message, context);
  }
}
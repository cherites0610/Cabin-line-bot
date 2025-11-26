import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'winston-daily-rotate-file';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logDir = join(__dirname, '../../logs');

export const winstonConfig = {
  level: 'info', 
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('NestApp', {
          colors: true,
          prettyPrint: true,
        }),
      ),
    }),

    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'app-%DATE%.json',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxSize: '5m',
      maxFiles: '1',             
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),   
      ),
    }),
    
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.json',
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxSize: '5m', 
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
};
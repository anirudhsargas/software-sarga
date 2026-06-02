import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_OUTPUT = process.env.LOG_OUTPUT || 'console';

const formatLine = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [MCP] ${level.toUpperCase()}: ${message}${metaStr}`;
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      formatLine,
    ),
  }),
];

if (LOG_OUTPUT === 'file') {
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '..', '..', 'mcp-server.log'),
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        formatLine,
      ),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
    }),
  );
}

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports,
});

export default logger;

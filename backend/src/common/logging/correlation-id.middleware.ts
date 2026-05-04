import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { correlationStorage } from './correlation-id.context';

const SAFE_CORRELATION_ID = /^[a-zA-Z0-9._-]{1,128}$/;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const headerVal = req.header('x-request-id');
    const correlationId =
      headerVal && SAFE_CORRELATION_ID.test(headerVal)
        ? headerVal
        : randomUUID();
    const sourceIp = (
      req.ip ??
      req.socket.remoteAddress ??
      'unknown'
    ).toString();
    res.setHeader('x-request-id', correlationId);
    correlationStorage.run({ correlationId, sourceIp }, () => next());
  }
}

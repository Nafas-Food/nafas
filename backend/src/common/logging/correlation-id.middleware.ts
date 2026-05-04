import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { correlationStorage } from './correlation-id.context';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const headerVal = req.header('x-request-id');
    const correlationId = headerVal && headerVal.length <= 128 ? headerVal : randomUUID();
    const sourceIp = (req.ip ?? req.socket.remoteAddress ?? 'unknown').toString();
    res.setHeader('x-request-id', correlationId);
    correlationStorage.run({ correlationId, sourceIp }, () => next());
  }
}
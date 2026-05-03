import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'Service + database liveness probe' })
  @ApiResponse({ status: 200, description: 'Service up; db state in payload.' })
  async check(): Promise<{
    status: 'ok' | 'degraded';
    checks: { db: 'ok' | 'down' };
    version: string;
  }> {
    const result = await this.health.check([() => this.prismaHealth.pingCheck('db')]);
    const dbOk = result.info?.db?.status === 'up';
    return {
      status: dbOk ? 'ok' : 'degraded',
      checks: { db: dbOk ? 'ok' : 'down' },
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }
}

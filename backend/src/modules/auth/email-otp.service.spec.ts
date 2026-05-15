import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OtpChannel } from '@prisma/client';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { EmailOtpService } from './email-otp.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthEventLogger } from '../../common/logging/auth-event.logger';
import { EMAIL_CLIENT } from '../email/email.client.interface';

type Row = {
  id: string;
  channel: OtpChannel;
  destination: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
};

interface FakePrisma {
  rows: Row[];
  otpCode: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: (cb: (tx: FakePrisma) => unknown) => Promise<unknown>;
}

function makeFakePrisma(): FakePrisma {
  const rows: Row[] = [];
  const fake: FakePrisma = {
    rows,
    otpCode: {
      create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: `row-${rows.length + 1}`,
          channel: data.channel!,
          destination: data.destination!,
          codeHash: data.codeHash!,
          expiresAt: data.expiresAt!,
          attempts: 0,
          consumedAt: null,
          createdAt: new Date(Date.now() + rows.length), // ensure ordering
        };
        rows.push(row);
        return row;
      }),
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        const now = new Date();
        const matches = rows
          .filter(
            (r) =>
              r.channel === w.channel &&
              r.destination === w.destination &&
              r.consumedAt === null &&
              r.expiresAt.getTime() > now.getTime(),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ?? null;
      }),
      update: jest.fn(
        async (args: {
          where: { id: string };
          data: { attempts?: { increment: number } };
        }) => {
          const row = rows.find((r) => r.id === args.where.id)!;
          if (args.data.attempts?.increment !== undefined) {
            row.attempts += args.data.attempts.increment;
          }
          return row;
        },
      ),
      updateMany: jest.fn(
        async (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const r of rows) {
            if (args.where.id !== undefined && r.id !== args.where.id) continue;
            if (
              args.where.channel !== undefined &&
              r.channel !== args.where.channel
            )
              continue;
            if (
              args.where.destination !== undefined &&
              r.destination !== args.where.destination
            )
              continue;
            if (
              args.where.consumedAt !== undefined &&
              r.consumedAt !== args.where.consumedAt
            )
              continue;
            if (args.data.consumedAt !== undefined) {
              r.consumedAt = args.data.consumedAt as Date | null;
            }
            count += 1;
          }
          return { count };
        },
      ),
    },
    $transaction: (cb) => Promise.resolve(cb(fake)),
  };
  return fake;
}

describe('EmailOtpService', () => {
  let service: EmailOtpService;
  let prisma: FakePrisma;
  let sendOtp: jest.Mock;

  beforeEach(async () => {
    prisma = makeFakePrisma();
    sendOtp = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailOtpService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthEventLogger, useValue: { emit: jest.fn() } },
        { provide: EMAIL_CLIENT, useValue: { sendOtp } },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'OTP_EMAIL_TTL_SECONDS') return '600';
              if (k === 'OTP_EMAIL_MAX_ATTEMPTS') return '3';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(EmailOtpService);
  });

  it('issue persists a hashed row, sends the email, and invalidates prior rows', async () => {
    await service.issue('mona@example.com', 'en');
    await service.issue('mona@example.com', 'en');
    expect(prisma.rows).toHaveLength(2);
    expect(prisma.rows[0].consumedAt).not.toBeNull(); // superseded
    expect(prisma.rows[1].consumedAt).toBeNull();
    expect(sendOtp).toHaveBeenCalledTimes(2);
    // hash is bcrypt — never the raw 6-digit code
    expect(prisma.rows[1].codeHash).toMatch(/^\$2[aby]\$/);
  });

  it('verify accepts the right code and consumes the row exactly once', async () => {
    await service.issue('mona@example.com', 'en');
    const code = sendOtp.mock.calls[0][1] as string;

    await expect(
      service.verify('mona@example.com', code),
    ).resolves.toBeUndefined();
    expect(prisma.rows[0].consumedAt).not.toBeNull();

    // Replay of same code now fails — no unconsumed row left.
    await expect(
      service.verify('mona@example.com', code),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verify rejects wrong codes and trips attempts-exceeded after MAX_ATTEMPTS', async () => {
    await service.issue('mona@example.com', 'en');

    // 3 wrong attempts: each returns EMAIL_OTP_INVALID, row stays unconsumed.
    for (let i = 0; i < 3; i++) {
      await expect(
        service.verify('mona@example.com', '000000'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    // 4th submission: attempts becomes 4 (> MAX=3) → 429 trip.
    const err = await service
      .verify('mona@example.com', '000000')
      .catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);

    // Subsequent submissions find no unconsumed row → EMAIL_OTP_INVALID.
    await expect(
      service.verify('mona@example.com', '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verify on a non-existent destination returns EMAIL_OTP_INVALID', async () => {
    await expect(
      service.verify('nobody@example.com', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('stores bcrypt-hashed codes (never plaintext)', async () => {
    await service.issue('mona@example.com', 'en');
    const code = sendOtp.mock.calls[0][1] as string;
    expect(prisma.rows[0].codeHash).not.toBe(code);
    expect(await bcrypt.compare(code, prisma.rows[0].codeHash)).toBe(true);
  });
});

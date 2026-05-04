import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshStrategy } from './strategies/refresh.strategy';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { TwilioModule } from '../twilio/twilio.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const privateKey = Buffer.from(
          config.getOrThrow<string>('JWT_PRIVATE_KEY'),
          'base64',
        ).toString('utf8');
        const publicKey = Buffer.from(
          config.getOrThrow<string>('JWT_PUBLIC_KEY'),
          'base64',
        ).toString('utf8');
        return {
          privateKey,
          publicKey,
          signOptions: {
            algorithm: 'RS256',
            issuer: config.get<string>('JWT_ISSUER') ?? 'nafas',
          },
          verifyOptions: {
            algorithms: ['RS256'],
            issuer: config.get<string>('JWT_ISSUER') ?? 'nafas',
          },
        };
      },
    }),
    PrismaModule,
    TwilioModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshStrategy],
  exports: [AuthService],
})
export class AuthModule {}
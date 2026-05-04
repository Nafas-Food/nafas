import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

/**
 * Verifies refresh credentials presented in the request body
 * (`{ refreshToken }`). Distinct from JwtStrategy so that JwtAuthGuard
 * (the global default) cannot be bypassed by sending a refresh
 * credential as a Bearer header.
 *
 * The blacklist check (FR-008/009) lives in AuthService.refresh and
 * AuthService.signOut, NOT here — this strategy only verifies signature
 * and expiry. AuthService rejects rotated/revoked credentials by
 * looking them up in InvalidatedToken.
 */
@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    const publicKey = Buffer.from(
      config.getOrThrow<string>('JWT_PUBLIC_KEY'),
      'base64',
    ).toString('utf8');
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
      issuer: config.get<string>('JWT_ISSUER') ?? 'nafas',
    });
  }

  async validate(payload: CurrentUserPayload): Promise<CurrentUserPayload> {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException();
    }
    return payload;
  }
}

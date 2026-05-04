import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

/**
 * Verifies access credentials presented as `Authorization: Bearer ...`.
 * Refuses any token whose `type` claim is not `'access'` so the
 * refresh credential cannot be used as an access credential by mistake.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const publicKey = Buffer.from(
      config.getOrThrow<string>('JWT_PUBLIC_KEY'),
      'base64',
    ).toString('utf8');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
      issuer: config.get<string>('JWT_ISSUER') ?? 'nafas',
    });
  }

  async validate(payload: CurrentUserPayload): Promise<CurrentUserPayload> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException();
    }
    return payload;
  }
}

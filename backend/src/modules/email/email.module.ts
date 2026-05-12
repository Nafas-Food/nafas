import { Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EMAIL_CLIENT } from './email.client.interface';
import { ResendEmailClient } from './resend-email.client';
import { LoggingEmailClient } from './logging-email.client';

const emailClientProvider: Provider = {
  provide: EMAIL_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    // Real Resend only when explicitly enabled OR in production. Default
    // to the logging fake so local dev never burns Resend quota and tests
    // run without a network egress.
    const live =
      config.get<string>('EMAIL_OTP_LIVE') === 'true' ||
      config.get<string>('NODE_ENV') === 'production';
    return live ? new ResendEmailClient(config) : new LoggingEmailClient();
  },
};

@Module({
  imports: [ConfigModule],
  providers: [emailClientProvider],
  exports: [EMAIL_CLIENT],
})
export class EmailModule {}

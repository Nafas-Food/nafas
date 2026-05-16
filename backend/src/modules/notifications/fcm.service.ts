import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

  onModuleInit(): void {
    if (admin.apps.length > 0) {
      this.initialized = true;
      return;
    }
    const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
    try {
      const credential = inlineJson
        ? admin.credential.cert(JSON.parse(inlineJson))
        : keyPath
          ? admin.credential.cert(keyPath)
          : null;
      if (!credential) {
        this.logger.warn(
          'FCM credentials not configured — push delivery disabled.',
        );
        return;
      }
      admin.initializeApp({ credential });
      this.initialized = true;
    } catch (err) {
      this.logger.error(
        `Failed to initialise firebase-admin: ${(err as Error).message}`,
      );
    }
  }

  async send(
    fcmToken: string | null,
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<void> {
    if (!this.initialized || !fcmToken) return;
    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
      });
    } catch (err) {
      this.logger.error(`FCM send failed: ${(err as Error).message}`);
    }
  }
}

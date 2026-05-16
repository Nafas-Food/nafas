import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }
    // Node.js 20 lacks a native WebSocket global; @supabase/realtime-js
    // (initialized eagerly inside createClient) needs one even though we
    // only use Storage here. Provide `ws` as the transport so the client
    // can be constructed. Drop this when the runtime moves to Node 22+.
    this.client = createClient(url, key, {
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    });
  }

  async upload(
    bucket: string,
    path: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const { error } = await this.client.storage
      .from(bucket)
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (error) {
      this.logger.error(
        `Supabase upload failed for ${bucket}/${path}: ${error.message}`,
      );
      throw error;
    }
    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async delete(bucket: string, path: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) {
      this.logger.error(
        `Supabase delete failed for ${bucket}/${path}: ${error.message}`,
      );
      throw error;
    }
  }
}

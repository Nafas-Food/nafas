import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
    this.client = createClient(url, key);
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
      this.logger.error(`Supabase upload failed for ${bucket}/${path}: ${error.message}`);
      throw error;
    }
    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async delete(bucket: string, path: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) {
      this.logger.error(`Supabase delete failed for ${bucket}/${path}: ${error.message}`);
      throw error;
    }
  }
}

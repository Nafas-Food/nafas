import { Injectable, Logger } from '@nestjs/common';
import { correlationStorage } from './correlation-id.context';

export type ChefEventType =
  | 'chef.apply'
  | 'chef.verify'
  | 'chef.reject'
  | 'chef.revoke'
  | 'chef.profile_update'
  | 'chef.availability_toggle'
  | 'chef.logo_upload'
  | 'chef.banner_upload';

export type ChefEventOutcome =
  | 'success'
  | 'validation_rejected'
  | 'application_pending'
  | 'already_chef'
  | 'rejected_cooldown_in_effect'
  | 'application_not_pending'
  | 'chef_not_verified'
  | 'not_found'
  | 'unsupported_media_type'
  | 'payload_too_large';

export interface ChefEventInput {
  event: ChefEventType;
  outcome: ChefEventOutcome;
  actorId?: string;
  chefId?: string;
  applicationId?: string;
  earliestResubmitAt?: string;
  isOpen?: boolean;
  mimeType?: string;
  byteSize?: number;
  sourceIp?: string;
}

/**
 * Emits one structured JSON line per chef-mutation event (FR-038).
 * Per FR-039 the line MUST NEVER carry latitude, longitude,
 * or any coordinate-derived value.
 */
@Injectable()
export class ChefEventLogger {
  private readonly log = new Logger('ChefEvent');

  emit(input: ChefEventInput) {
    const store = correlationStorage.getStore();
    const payload = {
      event: input.event,
      outcome: input.outcome,
      actorId: input.actorId ?? null,
      chefId: input.chefId ?? null,
      applicationId: input.applicationId ?? null,
      earliestResubmitAt: input.earliestResubmitAt ?? null,
      isOpen: input.isOpen ?? null,
      mimeType: input.mimeType ?? null,
      byteSize: input.byteSize ?? null,
      sourceIp: store?.sourceIp ?? input.sourceIp ?? 'unknown',
      correlationId: store?.correlationId ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
    this.log.log(JSON.stringify(payload));
  }

  applySuccess({
    actorUserId,
    applicationId,
    sourceIp,
  }: {
    actorUserId: string;
    applicationId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.apply',
      outcome: 'success',
      actorId: actorUserId,
      applicationId,
      sourceIp,
    });
  }
  applyValidationRejected({
    actorUserId,
    sourceIp,
  }: {
    actorUserId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.apply',
      outcome: 'validation_rejected',
      actorId: actorUserId,
      sourceIp,
    });
  }
  applyApplicationPending({
    actorUserId,
    applicationId,
    sourceIp,
  }: {
    actorUserId: string;
    applicationId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.apply',
      outcome: 'application_pending',
      actorId: actorUserId,
      applicationId,
      sourceIp,
    });
  }
  applyAlreadyChef({
    actorUserId,
    chefId,
    sourceIp,
  }: {
    actorUserId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.apply',
      outcome: 'already_chef',
      actorId: actorUserId,
      chefId,
      sourceIp,
    });
  }
  applyRejectedCooldownInEffect({
    actorUserId,
    earliestResubmitAt,
    sourceIp,
  }: {
    actorUserId: string;
    earliestResubmitAt: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.apply',
      outcome: 'rejected_cooldown_in_effect',
      actorId: actorUserId,
      earliestResubmitAt,
      sourceIp,
    });
  }
  verifySuccess({
    actorAdminId,
    chefId,
    sourceIp,
  }: {
    actorAdminId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.verify',
      outcome: 'success',
      actorId: actorAdminId,
      chefId,
      sourceIp,
    });
  }
  verifyApplicationNotPending({
    actorAdminId,
    chefId,
    sourceIp,
  }: {
    actorAdminId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.verify',
      outcome: 'application_not_pending',
      actorId: actorAdminId,
      chefId,
      sourceIp,
    });
  }
  rejectSuccess({
    actorAdminId,
    chefId,
    sourceIp,
  }: {
    actorAdminId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.reject',
      outcome: 'success',
      actorId: actorAdminId,
      chefId,
      sourceIp,
    });
  }
  rejectApplicationNotPending({
    actorAdminId,
    chefId,
    sourceIp,
  }: {
    actorAdminId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.reject',
      outcome: 'application_not_pending',
      actorId: actorAdminId,
      chefId,
      sourceIp,
    });
  }
  revokeSuccess({
    actorAdminId,
    chefId,
    sourceIp,
  }: {
    actorAdminId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.revoke',
      outcome: 'success',
      actorId: actorAdminId,
      chefId,
      sourceIp,
    });
  }
  revokeChefNotVerified({
    actorAdminId,
    chefId,
    sourceIp,
  }: {
    actorAdminId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.revoke',
      outcome: 'chef_not_verified',
      actorId: actorAdminId,
      chefId,
      sourceIp,
    });
  }
  profileUpdateSuccess({
    actorChefId,
    chefId,
    sourceIp,
  }: {
    actorChefId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.profile_update',
      outcome: 'success',
      actorId: actorChefId,
      chefId,
      sourceIp,
    });
  }
  profileUpdateValidationRejected({
    actorChefId,
    sourceIp,
  }: {
    actorChefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.profile_update',
      outcome: 'validation_rejected',
      actorId: actorChefId,
      sourceIp,
    });
  }
  profileUpdateNotFound({
    actorChefId,
    sourceIp,
  }: {
    actorChefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.profile_update',
      outcome: 'not_found',
      actorId: actorChefId,
      sourceIp,
    });
  }
  availabilityToggleSuccess({
    actorChefId,
    chefId,
    isOpen,
    sourceIp,
  }: {
    actorChefId: string;
    chefId: string;
    isOpen: boolean;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.availability_toggle',
      outcome: 'success',
      actorId: actorChefId,
      chefId,
      isOpen,
      sourceIp,
    });
  }
  availabilityToggleNotFound({
    actorChefId,
    sourceIp,
  }: {
    actorChefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.availability_toggle',
      outcome: 'not_found',
      actorId: actorChefId,
      sourceIp,
    });
  }
  availabilityValidationRejected({
    actorChefId,
    sourceIp,
  }: {
    actorChefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.availability_toggle',
      outcome: 'validation_rejected',
      actorId: actorChefId,
      sourceIp,
    });
  }
  logoUploadSuccess({
    actorChefId,
    chefId,
    sourceIp,
  }: {
    actorChefId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.logo_upload',
      outcome: 'success',
      actorId: actorChefId,
      chefId,
      sourceIp,
    });
  }
  logoUploadUnsupportedMediaType({
    actorChefId,
    mimeType,
    sourceIp,
  }: {
    actorChefId: string;
    mimeType: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.logo_upload',
      outcome: 'unsupported_media_type',
      actorId: actorChefId,
      mimeType,
      sourceIp,
    });
  }
  logoUploadPayloadTooLarge({
    actorChefId,
    byteSize,
    sourceIp,
  }: {
    actorChefId: string;
    byteSize: number;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.logo_upload',
      outcome: 'payload_too_large',
      actorId: actorChefId,
      byteSize,
      sourceIp,
    });
  }
  bannerUploadSuccess({
    actorChefId,
    chefId,
    sourceIp,
  }: {
    actorChefId: string;
    chefId: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.banner_upload',
      outcome: 'success',
      actorId: actorChefId,
      chefId,
      sourceIp,
    });
  }
  bannerUploadUnsupportedMediaType({
    actorChefId,
    mimeType,
    sourceIp,
  }: {
    actorChefId: string;
    mimeType: string;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.banner_upload',
      outcome: 'unsupported_media_type',
      actorId: actorChefId,
      mimeType,
      sourceIp,
    });
  }
  bannerUploadPayloadTooLarge({
    actorChefId,
    byteSize,
    sourceIp,
  }: {
    actorChefId: string;
    byteSize: number;
    sourceIp: string;
  }) {
    this.emit({
      event: 'chef.banner_upload',
      outcome: 'payload_too_large',
      actorId: actorChefId,
      byteSize,
      sourceIp,
    });
  }
}

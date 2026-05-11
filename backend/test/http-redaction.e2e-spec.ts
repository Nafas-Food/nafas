import { Test } from '@nestjs/testing';
import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionNormalizerFilter } from '../src/common/errors/http-exception.filter';
import { AuthEventLogger } from '../src/common/logging/auth-event.logger';
import { AddressEventLogger } from '../src/common/logging/address-event.logger';

function makeHost(req: {
  url: string;
  method: string;
  user?: { sub: string };
}): ArgumentsHost {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost & { __res: typeof res };
}

describe('HttpExceptionNormalizerFilter (FR-019 / FR-021 / R6)', () => {
  let filter: HttpExceptionNormalizerFilter;
  let addressEvents: { emit: jest.Mock };

  beforeEach(async () => {
    addressEvents = { emit: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        HttpExceptionNormalizerFilter,
        { provide: AuthEventLogger, useValue: { emit: jest.fn() } },
        { provide: AddressEventLogger, useValue: addressEvents },
      ],
    }).compile();
    filter = mod.get(HttpExceptionNormalizerFilter);
  });

  function run(
    exc: HttpException,
    req: { url: string; method: string; user?: { sub: string } } = {
      url: '/x',
      method: 'POST',
    },
  ) {
    const host = makeHost(req);
    const res = host.switchToHttp().getResponse() as unknown as {
      status: jest.Mock;
      json: jest.Mock;
    };
    filter.catch(exc, host);
    return res.json.mock.calls[0][0];
  }

  describe('coordinate scrubber (FR-021 / R6)', () => {
    it('strips top-level latitude/longitude', () => {
      const body = run(
        new HttpException(
          { code: 'X', message: 'm', latitude: 30, longitude: 31 },
          400,
        ),
      );
      expect(body).not.toHaveProperty('latitude');
      expect(body).not.toHaveProperty('longitude');
    });

    it('strips nested coordinates inside details', () => {
      const body = run(
        new HttpException(
          {
            code: 'X',
            message: 'm',
            details: { coordinates: { latitude: 1, longitude: 2 }, k: 'v' },
          },
          400,
        ),
      );
      expect(body.details).not.toHaveProperty('coordinates');
      expect(body.details.k).toBe('v');
    });

    it('strips inside arrays of nested errors', () => {
      const body = run(
        new HttpException(
          {
            code: 'X',
            message: 'm',
            details: { fields: [{ latitude: 1 }, { other: 'y' }] },
          },
          400,
        ),
      );
      expect(body.details.fields[0]).not.toHaveProperty('latitude');
      expect(body.details.fields[1]).toEqual({ other: 'y' });
    });

    it('preserves a body that has no coordinate keys', () => {
      const body = run(new BadRequestException({ code: 'V', message: 'bad' }));
      expect(body.code).toBe('V');
    });
  });

  describe('FR-019 address-path emission (C1 fix)', () => {
    it('emits address.create / validation_rejected on POST /api/v1/addresses 400', () => {
      const validationExc = new BadRequestException({
        message: ['latitude must not be greater than 90'],
      });
      run(validationExc, {
        url: '/api/v1/addresses',
        method: 'POST',
        user: { sub: 'u-1' },
      });
      expect(addressEvents.emit).toHaveBeenCalledTimes(1);
      const emitted = addressEvents.emit.mock.calls[0][0];
      expect(emitted.event).toBe('address.create');
      expect(emitted.outcome).toBe('validation_rejected');
      expect(emitted.actorId).toBe('u-1');
    });

    it('emits address.update / not_found on PATCH /api/v1/addresses/:id 404', () => {
      const exc = new NotFoundException({
        code: 'ADDRESS_NOT_FOUND',
        message: 'x',
      });
      run(exc, {
        url: '/api/v1/addresses/abc-123',
        method: 'PATCH',
        user: { sub: 'u-2' },
      });
      expect(addressEvents.emit).toHaveBeenCalledTimes(1);
      expect(addressEvents.emit.mock.calls[0][0]).toMatchObject({
        event: 'address.update',
        outcome: 'not_found',
        actorId: 'u-2',
        addressId: 'abc-123',
      });
    });

    it('emits address.delete / not_found on DELETE /api/v1/addresses/:id 404', () => {
      const exc = new NotFoundException({
        code: 'ADDRESS_NOT_FOUND',
        message: 'x',
      });
      run(exc, {
        url: '/api/v1/addresses/xyz',
        method: 'DELETE',
        user: { sub: 'u-3' },
      });
      expect(addressEvents.emit.mock.calls[0][0]).toMatchObject({
        event: 'address.delete',
        outcome: 'not_found',
        addressId: 'xyz',
      });
    });

    it('does NOT emit for non-address paths', () => {
      run(new BadRequestException('x'), {
        url: '/api/v1/auth/sign-in',
        method: 'POST',
      });
      expect(addressEvents.emit).not.toHaveBeenCalled();
    });

    it('does NOT emit for address GETs (read paths are not in FR-019 scope)', () => {
      run(new NotFoundException('x'), {
        url: '/api/v1/addresses/abc',
        method: 'GET',
      });
      expect(addressEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe('ADDRESS_IN_USE activeOrderId preservation (FR-013)', () => {
    it('keeps activeOrderId at the top level of the 409 body', () => {
      const body = run(
        new ConflictException({
          code: 'ADDRESS_IN_USE',
          message: 'Address is in use by an order in progress.',
          activeOrderId: '11111111-2222-3333-4444-555555555555',
        }),
        {
          url: '/api/v1/addresses/abc-123',
          method: 'DELETE',
          user: { sub: 'u-7' },
        },
      );
      expect(body).toMatchObject({
        code: 'ADDRESS_IN_USE',
        activeOrderId: '11111111-2222-3333-4444-555555555555',
      });
      expect(body).not.toHaveProperty('latitude');
      expect(body).not.toHaveProperty('longitude');
    });
  });
});

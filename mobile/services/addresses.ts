import { api } from './api';

export interface Address {
  id: string;
  label: string;
  streetName: string;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  latitude: string;
  longitude: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAddressInput {
  label: string;
  streetName: string;
  building?: string;
  floor?: string;
  apartment?: string;
  latitude: number;
  longitude: number;
  notes?: string;
}

export interface UpdateAddressInput {
  label?: string;
  streetName?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export interface AddressInUseError {
  code: 'ADDRESS_IN_USE';
  message: string;
  activeOrderId: string;
}

export const addressesService = {
  async list(): Promise<Address[]> {
    const { data } = await api.get<Address[]>('/addresses');
    return data;
  },
  async create(input: CreateAddressInput): Promise<Address> {
    const { data } = await api.post<Address>('/addresses', input);
    return data;
  },
  async update(id: string, input: UpdateAddressInput): Promise<Address> {
    const { data } = await api.patch<Address>(`/addresses/${id}`, input);
    return data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/addresses/${id}`);
  },
};
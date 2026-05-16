import React from 'react';
import { AddressPickerMap } from './AddressPickerMap';

export interface KitchenLocationPickerProps {
  value: { latitude: number; longitude: number } | null;
  onChange: (next: { latitude: number; longitude: number }) => void;
  /** Optional UX hint: reverse-geocoded street string for the kitchen address. */
  onReverseGeocode?: (street: string) => void;
  testID?: string;
}

/**
 * Phase 3 wrapper over the Phase 2 AddressPickerMap. Keeps the chef-apply
 * and chef-profile-editor screens importable from a chef-context-named
 * path. If divergence is ever needed (e.g., delivery-radius circle around
 * the kitchen pin) it lands here, not in AddressPickerMap.
 */
export const KitchenLocationPicker: React.FC<KitchenLocationPickerProps> = (props) => {
  return <AddressPickerMap {...props} />;
};

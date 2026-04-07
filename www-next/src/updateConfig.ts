// Project-specific update configuration for StarNav.
// RVR has its own version of this file.

import type { UpdateDevice } from '@update/types';

export const updateConfig = {
  projectName: 'StarNav',
  projectShort: 'StarNav',
  repoUrl: 'https://github.com/jack7169/Starnav',
  modalTitle: 'Update StarNav',
  hasRemoteDevices: false,
};

export async function fetchUpdateDevices(): Promise<UpdateDevice[]> {
  return [];
}

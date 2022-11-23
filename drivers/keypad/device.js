'use strict';

const Device = require('../../lib/Device');
const { filled, blank } = require('../../lib/Utils');

class KeypadDevice extends Device {

  /*
  | Synchronization functions
  */

  // Returns settings from given data
  getSettingsData(data) {
    const settings = {};

    if (blank(data.deviceSettings)) {
      return settings;
    }

    // Set device settings
    const device = data.deviceSettings;

    if (filled(device.soundLevel)) {
      settings.sound_level = `${device.soundLevel}`;
    }

    if (filled(device.backlightLevel)) {
      settings.backlight_level = `${device.backlightLevel}`;
    }

    if (filled(device.bellButtonEnabled)) {
      settings.bell_button_enabled = device.bellButtonEnabled;
    }

    return settings;
  }

  // Set availability
  async setAvailability(data) {
    this.setAvailable().catch(this.error);
  }

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    const settings = {};

    // Sound level updated
    if (changedKeys.includes('sound_level')) {
      const level = Number(newSettings.sound_level);

      this.log(`Sound level is now '${level}'`);

      settings.soundLevel = level;
    }

    // Backlight level updated
    if (changedKeys.includes('backlight_level')) {
      const level = Number(newSettings.backlight_level);

      this.log(`Backlight level is now '${level}'`);

      settings.backlightLevel = level;
    }

    // Bell button enabled updated
    if (changedKeys.includes('bell_button_enabled')) {
      this.log(`Bell button enabled is now '${newSettings.bell_button_enabled}'`);

      settings.bellButtonEnabled = newSettings.bell_button_enabled;
    }

    // Device settings need to be updated
    const tedeeId = this.getSetting('tedee_id');

    if (filled(settings)) {
      await this.oAuth2Client.updateSettings('keypad', tedeeId, settings);

      this.log(`Keypad settings ${tedeeId} updated successfully!`);
    }
  }

}

module.exports = KeypadDevice;

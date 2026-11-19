import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appDataFolder, parseFolderFile } from '../src/index.ts';

describe('folder.json', () => {
  it('reads folder.json, ignoring anything but an absolute path', () => {
    expect(parseFolderFile({ folder: '/Users/me/Clock' })).toBe('/Users/me/Clock');
    expect(parseFolderFile({ folder: 'Clock' })).toBeNull();
    expect(parseFolderFile({ folder: 3 })).toBeNull();
    expect(parseFolderFile(null)).toBeNull();
  });

  it("finds the desktop app's data folder where Electron keeps it on each system", () => {
    expect(appDataFolder('darwin', {}, '/Users/me')).toBe('/Users/me/Library/Application Support/Alarmony');
    expect(appDataFolder('linux', {}, '/home/me')).toBe('/home/me/.config/Alarmony');
    expect(appDataFolder('linux', { XDG_CONFIG_HOME: '/cfg' }, '/home/me')).toBe('/cfg/Alarmony');
    expect(appDataFolder('win32', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'C:\\Users\\me')).toBe(
      path.join('C:\\Users\\me\\AppData\\Roaming', 'Alarmony'),
    );
  });
});

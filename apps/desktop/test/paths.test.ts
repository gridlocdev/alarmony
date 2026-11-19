import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appFile, dataPaths, isAppUrl } from '../src/paths.ts';

describe('dataPaths', () => {
  const documents = '/Users/me/Documents';

  it('keeps clock.json in Documents/Alarmony', () => {
    expect(dataPaths({}, documents)).toEqual({ userData: null, folder: `${documents}/Alarmony` });
  });

  it('keeps a check inside its throwaway folder', () => {
    expect(dataPaths({ ALARMONY_USER_DATA: '/tmp/check' }, documents)).toEqual({
      userData: '/tmp/check',
      folder: '/tmp/check/Alarmony',
    });
  });

  it('uses the folder ALARMONY_FOLDER names', () => {
    const env = { ALARMONY_USER_DATA: '/tmp/check', ALARMONY_FOLDER: '/tmp/shared' };
    expect(dataPaths(env, documents).folder).toBe('/tmp/shared');
  });
});

describe('app:// files', () => {
  const root = path.resolve('/app/web');

  it('serves only inside the web build', () => {
    expect(appFile(root, '/')).toBe(path.join(root, 'index.html'));
    expect(appFile(root, '/assets/index.js')).toBe(path.join(root, 'assets/index.js'));
    expect(appFile(root, '/../main.js')).toBeNull();
    expect(appFile(root, '/%2e%2e/main.js')).toBeNull();
    expect(appFile(root, '/%E0%A4%A')).toBeNull();
  });

  it('trusts only our own page', () => {
    expect(isAppUrl('app://alarmony/index.html')).toBe(true);
    expect(isAppUrl('app://alarmony.evil/index.html')).toBe(false);
    expect(isAppUrl('https://example.com/')).toBe(false);
    expect(isAppUrl(undefined)).toBe(false);
  });
});

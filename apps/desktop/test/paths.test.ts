import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appFile, dataPaths, isAppUrl, parseFolderFile, startFolder } from '../src/paths.ts';

describe('dataPaths', () => {
  const documents = '/Users/me/Documents';

  it('keeps clock.json in Documents/Alarmony', () => {
    expect(dataPaths({}, documents)).toEqual({
      userData: null,
      folder: `${documents}/Alarmony`,
      fixed: false,
    });
  });

  it('keeps a check inside its throwaway folder', () => {
    expect(dataPaths({ ALARMONY_USER_DATA: '/tmp/check' }, documents)).toEqual({
      userData: '/tmp/check',
      folder: '/tmp/check/Alarmony',
      fixed: true,
    });
  });

  it('uses the folder ALARMONY_FOLDER names', () => {
    const env = { ALARMONY_USER_DATA: '/tmp/check', ALARMONY_FOLDER: '/tmp/shared' };
    expect(dataPaths(env, documents).folder).toBe('/tmp/shared');
  });
});

describe('the folder at start', () => {
  const documents = '/Users/me/Documents';
  const plain = dataPaths({}, documents);
  const there = (folders: string[]) => (f: string) => folders.includes(f);

  it('asks on the first start', () => {
    expect(startFolder(plain, false, null, there([]))).toEqual({ kind: 'ask', gone: null });
  });

  it('reopens the remembered folder while it is there', () => {
    expect(startFolder(plain, false, '/Volumes/Sync/Clock', there(['/Volumes/Sync/Clock']))).toEqual({
      kind: 'use',
      folder: '/Volumes/Sync/Clock',
    });
  });

  it('asks again, naming it, when the remembered folder is gone', () => {
    expect(startFolder(plain, false, '/Volumes/Sync/Clock', there([]))).toEqual({
      kind: 'ask',
      gone: '/Volumes/Sync/Clock',
    });
  });

  it('never asks during a check or a headless run', () => {
    const check = dataPaths({ ALARMONY_USER_DATA: '/tmp/check' }, documents);
    expect(startFolder(check, false, '/elsewhere', there(['/elsewhere']))).toEqual({
      kind: 'use',
      folder: '/tmp/check/Alarmony',
    });
    expect(startFolder(plain, true, null, there([]))).toEqual({ kind: 'use', folder: plain.folder });
  });

  it('reads folder.json, ignoring anything but an absolute path', () => {
    expect(parseFolderFile({ folder: '/Users/me/Clock' })).toBe('/Users/me/Clock');
    expect(parseFolderFile({ folder: 'Clock' })).toBeNull();
    expect(parseFolderFile({ folder: 3 })).toBeNull();
    expect(parseFolderFile(null)).toBeNull();
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

// Runs after electron-builder lays out the app and before it signs it: turns off the ways to run the app's
// Electron as plain Node or attach a debugger, and loads the app only from app.asar.
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';
import path from 'node:path';

const NAMES = { darwin: '.app', mas: '.app', win32: '.exe', linux: '' };

export default async function fuses(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const name = electronPlatformName === 'linux' ? packager.executableName : packager.appInfo.productFilename;
  await flipFuses(path.join(appOutDir, `${name}${NAMES[electronPlatformName]}`), {
    version: FuseVersion.V1,
    // Ad-hoc signed builds are signed again by electron-builder after this; reset so the signature stays valid.
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // Only when the app is packaged as an asar, or it would load nothing.
    [FuseV1Options.OnlyLoadAppFromAsar]: packager.config.asar !== false,
  });
}

import { fork } from 'node:child_process';
import { createInterface } from 'node:readline';
import { prepareCredentialDestination } from '../src/credential-store.js';
import { qrChildEnvironment, superviseQrChild } from '../src/qr-child-boundary.js';

const flags = '--confirm-official-scan --confirm-scanner-is-owner --confirm-save-qq-credentials --confirm-select-existing-app-after-scan';
if (process.argv.slice(2).join(' ') !== flags) {
  console.log(JSON.stringify({ mode: 'QQ_POST_SCAN_ENROLLMENT_PLAN', scan_started: false, credentials_written: false,
    required_settings: ['QQ_CREDENTIAL_DIRECTORY'], post_scan_confirmation_required: true, service_started: false }));
} else {
  let child, input;
  try {
    const credentialDirectory = process.env.QQ_CREDENTIAL_DIRECTORY;
    prepareCredentialDestination(credentialDirectory);
    child = fork(new URL('./qq-enroll-worker.js', import.meta.url), [], {
      env: qrChildEnvironment(process.env), execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const controller = new AbortController(); let waiting = false;
    process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
    input = createInterface({ input: process.stdin });
    input.on('line', line => {
      if (line === 'cancel') controller.abort();
      if (line === 'confirm-existing-app' && waiting && child.connected) {
        waiting = false; child.send({ action: 'confirm-existing-app' });
      }
    });
    superviseQrChild(child, { output: value => {
      console.log(JSON.stringify(value));
      if (typeof value.status === 'string') { input.close(); process.stdin.pause(); }
    }, failed: () => { process.exitCode = 1; input.close(); process.stdin.pause(); }, signal: controller.signal,
    allowCredentialsWritten: true, allowSelectionConfirmation: true, selectionPending: () => { waiting = true; } });
    child.send({ approved: true, scannerIsOwner: true, persistCredentials: true,
      confirmExistingAppAfterScan: true, credentialDirectory, profile: 'tencent-sdk' });
  } catch { child?.kill(); input?.close(); console.log(JSON.stringify({ status: 'persistent_enrollment_setup_failed', service_started: false })); process.exitCode = 1; }
}

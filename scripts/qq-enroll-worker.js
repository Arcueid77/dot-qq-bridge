import { QR_LOCAL_WAIT_MS, QR_WORKER_MAX_MS } from '../src/qr-limits.js';
import { prepareCredentialDestination, saveQqCredentials } from '../src/credential-store.js';
import { installQrTransport, scanOfficialBotForEnrollment } from '../src/official-qr.js';
import { waitForExistingAppConfirmation } from '../src/enrollment-confirmation.js';
import { qrFailureReason } from '../src/qr-failures.js';

const emit = value => { if (process.connected) process.send(value); };
process.once('message', async config => {
  let restore, candidate, stage = 'setup_failed';
  const controller = new AbortController(), deadlineEpochMs = Date.now() + QR_LOCAL_WAIT_MS;
  process.once('disconnect', () => controller.abort());
  const timer = setTimeout(() => process.exit(1), QR_WORKER_MAX_MS);
  try {
    if (config?.approved !== true || config.scannerIsOwner !== true || config.persistCredentials !== true ||
        config.confirmExistingAppAfterScan !== true || config.profile !== 'tencent-sdk') throw new Error();
    prepareCredentialDestination(config.credentialDirectory);
    restore = installQrTransport({ allowDirect: true, diagnostic: emit, signal: controller.signal });
    stage = 'sdk_start_failed';
    const { startQrConnect } = await import('@tencent-connect/qqbot-connector');
    candidate = await scanOfficialBotForEnrollment(startQrConnect, { ...config, signal: controller.signal,
      displayQr: url => emit({ type: 'qr', url }) });
    restore(); restore = null;
    // Register the listener before notifying the parent. No credentials on IPC.
    const confirmation = waitForExistingAppConfirmation(process, { signal: controller.signal, deadlineEpochMs });
    emit({ type: 'selection', state: 'awaiting_existing_app_confirmation', owner_identity_verified: true });
    await confirmation;
    if (controller.signal.aborted || Date.now() >= deadlineEpochMs) throw new Error();
    stage = 'credential_save_failed';
    saveQqCredentials(candidate, { directory: config.credentialDirectory, expectedAppId: candidate.appId, profile: config.profile });
    emit({ type: 'result', status: 'official_scan_validated', credentials_written: true,
      owner_identity_verified: true, current_dot_connected: false });
  } catch (error) {
    emit({ type: 'result', status: 'scan_failed_or_scope_rejected', failure_reason: qrFailureReason(error, stage),
      credentials_written: false, current_dot_connected: false });
  } finally { candidate = undefined; restore?.(); clearTimeout(timer); if (process.connected) process.disconnect(); }
});

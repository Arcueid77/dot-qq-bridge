import { qrFailure } from './qr-failures.js';

// Exactly one operator acknowledgement after the official owner result. Early
// acknowledgements cannot authorize a later result. Values never leave memory.
export function waitForExistingAppConfirmation(channel, { signal, deadlineEpochMs, clock = Date.now } = {}) {
  if (!Number.isFinite(deadlineEpochMs) || deadlineEpochMs <= clock()) return Promise.reject(qrFailure('Enrollment deadline', 'local_deadline_reached'));
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = error => {
      if (done) return; done = true; clearTimeout(timer);
      channel.removeListener('message', message); signal?.removeEventListener('abort', cancel);
      error ? reject(error) : resolve(true);
    };
    const cancel = () => finish(qrFailure('Enrollment cancelled', 'cancelled'));
    const message = value => {
      if (!value || Object.keys(value).length !== 1 || value.action !== 'confirm-existing-app') return;
      if (clock() >= deadlineEpochMs) finish(qrFailure('Enrollment deadline', 'local_deadline_reached'));
      else finish();
    };
    const timer = setTimeout(() => finish(qrFailure('Enrollment deadline', 'local_deadline_reached')), deadlineEpochMs - clock());
    channel.on('message', message); signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

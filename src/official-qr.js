import { QR_LOCAL_WAIT_MS, QR_PARENT_MAX_MS, QR_REQUEST_BUDGET, QR_REQUEST_TIMEOUT_MS } from './qr-limits.js';
import https from 'node:https';
import { BridgeError } from './common.js';
import { configuredProviderProxy, createProviderProxyAgent } from './provider-network.js';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { publicAddress } from './network.js';
import { inspectQrCredentials } from './connection-wizard.js';
import { qrFailure } from './qr-failures.js';

export const QR_REVIEW = 'Official npm 1.2.0 README public startQrConnect integration; no SDK redistribution or reimplementation';
export function officialQrUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== 'q.qq.com' || url.port || url.username || url.password || url.hash ||
      url.pathname !== '/qqbot/openclaw/connect.html' || !/^[a-zA-Z0-9_-]{1,256}$/.test(url.searchParams.get('task_id') ?? '') ||
      [...url.searchParams.keys()].some(key => !['task_id', 'source', '_wv'].includes(key)) ||
      url.searchParams.get('source') !== '' || url.searchParams.get('_wv') !== '2' ||
      [...new Set(url.searchParams.keys())].some(key => url.searchParams.getAll(key).length !== 1)) throw new BridgeError('Official QR URL rejected');
  return url.href;
}

// Use ONLY inside the isolated scanner child. Never change the bridge's agent,
// callback DNS pinning, or OAuth transport. The SDK's public API has no agent option.
export function createQrDirectAgent({ lookup = dnsLookup } = {}) {
  class DirectQrAgent extends https.Agent {
    addRequest(req, options) {
      const host = options.hostname ?? options.host;
      if (host !== 'q.qq.com' || (options.port && Number(options.port) !== 443) || options.socketPath ||
          options.rejectUnauthorized === false || (options.servername && options.servername !== host)) {
        throw new BridgeError('Official QR destination rejected');
      }
      return super.addRequest(req, { ...options, servername: host, rejectUnauthorized: true });
    }
  }
  return new DirectQrAgent({ keepAlive: false, rejectUnauthorized: true,
    lookup(host, options, callback) {
      if (host !== 'q.qq.com') { callback(new Error('Official QR hostname rejected')); return; }
      Promise.resolve().then(() => lookup(host, { all: true, verbatim: true })).then(answers => {
        if (!Array.isArray(answers) || !answers.length || answers.length > 32 ||
            answers.some(a => !publicAddress(a.address) || isIP(a.address) !== a.family)) {
          throw new Error('Official QR DNS rejected');
        }
        options.all ? callback(null, answers) : callback(null, answers[0].address, answers[0].family);
      }).catch(() => callback(new Error('Official QR DNS rejected')));
    },
  });
}

export function installQrTransport({ env = process.env, target = https, factory = createProviderProxyAgent,
  allowDirect = false, directFactory = createQrDirectAgent, diagnostic = () => {}, signal } = {}) {
  let agent = factory({ env, allowedHost: host => host === 'q.qq.com' });
  if (!agent) {
    if (allowDirect !== true || configuredProviderProxy(env)) throw new BridgeError('The official scanner requires the configured cloud proxy');
    agent = directFactory();
  }
  const add = agent.addRequest.bind(agent); let requests = 0; const pendingCleanups = new Set();
  agent.addRequest = (req, options) => {
    if (++requests > QR_REQUEST_BUDGET || options.method !== 'POST' || !['/lite/create_bind_task', '/lite/poll_bind_result'].includes(options.path)) {
      throw new BridgeError('QR request is outside the approved scope');
    }
    if (signal?.aborted) throw new BridgeError('Official scanner cancelled');
    // Total outer request bound; SDK and proxy timeouts may expire earlier.
    // Do not claim Agent options override ClientRequest's existing timeout.
    const deadline = setTimeout(() => req.destroy(Object.assign(new Error('QQ request timed out'), { code: 'ETIMEDOUT' })), QR_REQUEST_TIMEOUT_MS);
    deadline.unref?.();
    const abort = () => req.destroy(Object.assign(new Error('QQ request cancelled'), { code: 'ABORT_ERR' }));
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      clearTimeout(deadline); pendingCleanups.delete(cleanup);
      signal?.removeEventListener('abort', abort); req.removeListener('close', cleanup);
    };
    pendingCleanups.add(cleanup); req.once('close', cleanup);
    const sequence = requests, started = Date.now();
    const stage = options.path === '/lite/create_bind_task' ? 'create' : 'poll';
    const report = (phase, status = null, code = null) => diagnostic({ type: 'transport', stage, method: 'POST',
      sequence, phase, status, elapsed_ms: Math.min(QR_PARENT_MAX_MS, Math.max(0, Date.now() - started)), code });
    report('start');
    req.once('error', error => report('error', null, ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH',
      'EAI_AGAIN', 'ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_NETWORK_ACCESS_DENIED'].includes(error?.code) ? error.code : 'OTHER'));
    req.once('timeout', () => report('timeout', null, 'ETIMEDOUT'));
    req.once('response', res => report('response', Number.isInteger(res.statusCode) && res.statusCode >= 100 && res.statusCode <= 599 ? res.statusCode : null));
    // The SDK does not follow redirects. Bound its otherwise unbounded response.
    req.once('response', res => { let bytes = 0; res.on('data', chunk => {
      bytes += chunk.length; if (bytes > 262144) { res.destroy(); req.destroy(); }
    }); });
    try { return add(req, options); }
    catch (error) { cleanup(); throw error; }
  };
  const previous = target.globalAgent; target.globalAgent = agent;
  return () => { target.globalAgent = previous; for (const cleanup of pendingCleanups) cleanup(); agent.destroy(); };
}

export function scanOfficialBot(startQrConnect, options = {}) {
  return scanOfficialCandidate(startQrConnect, { ...options, discoverApplication: false });
}

// Returns an in-memory candidate only. This route never verifies a prior AppID
// and never saves credentials; its caller must obtain post-scan confirmation.
export function scanOfficialBotForEnrollment(startQrConnect, options = {}) {
  if (options.confirmExistingAppAfterScan !== true) return Promise.reject(qrFailure('Post-scan application confirmation required', 'invalid_configuration'));
  return scanOfficialCandidate(startQrConnect, { ...options, expectedAppId: undefined, discoverApplication: true });
}

function scanOfficialCandidate(startQrConnect, { approved = false, expectedAppId, scannerIsOwner = false,
  discoverApplication = false,
  displayQr, signal, timeoutMs = QR_LOCAL_WAIT_MS } = {}) {
  if (approved !== true || scannerIsOwner !== true || (!discoverApplication && !/^[a-zA-Z0-9_-]{1,128}$/.test(expectedAppId ?? '')) ||
      typeof displayQr !== 'function' || typeof startQrConnect !== 'function' ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > QR_LOCAL_WAIT_MS) {
    return Promise.reject(qrFailure('Explicit scan consent, existing bot AppID and scanner-owner confirmation are required', 'invalid_configuration'));
  }
  return new Promise((resolve, reject) => {
    let stop, done = false;
    const deadlineEpochMs = Date.now() + timeoutMs;
    const controller = new AbortController();
    const finish = (error, candidate, failureReason) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      controller.abort(); try { stop?.(); } catch { /* never emit SDK errors */ }
      error ? reject(qrFailure(error, failureReason)) : resolve(candidate);
    };
    const cancel = () => finish('Official scan cancelled', null, 'cancelled');
    const timer = setTimeout(() => finish('Official scan expired', null, 'local_deadline_reached'), timeoutMs);
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      stop = startQrConnect({
        onQrDisplayed(raw) { if (!done) { try { displayQr(officialQrUrl(raw)); } catch { finish('Official QR display rejected', null, 'qr_display_rejected'); } } },
        onQrExpired() { finish('Official QR expired; explicit restart required', null, 'official_qr_expired'); },
        onFailure() { finish('Official scan failed', null, 'sdk_reported_failure'); },
        onSuccess(credentials) {
          queueMicrotask(() => {
            if (done) return;
            if (Date.now() >= deadlineEpochMs) { finish('Official scan expired', null, 'local_deadline_reached'); return; }
            try {
              const rejectScope = reason => finish('Returned bot or scanner-owner identity did not match the approved scope', null, reason);
              if (!Array.isArray(credentials) || credentials.length !== 1) { rejectScope('result_count_rejected'); return; }
              if (!credentials[0] || typeof credentials[0].appId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(credentials[0].appId)) { rejectScope('credential_result_invalid'); return; }
              if (!discoverApplication && credentials[0].appId !== expectedAppId) { rejectScope('expected_app_mismatch'); return; }
              const owner = credentials[0].userOpenid;
              if (owner === undefined || owner === null || owner === '') { rejectScope('owner_identity_missing'); return; }
              if (typeof owner !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) { rejectScope('owner_identity_invalid'); return; }
              const candidate = inspectQrCredentials(credentials, { appId: expectedAppId ?? credentials[0].appId,
                confirmedOwnerOpenid: credentials[0].userOpenid, ownerEvidence: 'official-qr-response' });
              finish(null, candidate);
            } catch { finish('Returned bot or scanner-owner identity did not match the approved scope', null, 'credential_result_invalid'); }
          });
        }
      }, { displayQrCodeToConsole: false, source: '', signal: controller.signal });
      if (typeof stop !== 'function') throw new Error();
      if (done) stop();
    } catch { finish('Official scanner could not start', null, 'sdk_start_failed'); }
  });
}

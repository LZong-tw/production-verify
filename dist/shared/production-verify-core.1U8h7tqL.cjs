'use strict';

const DEFAULT_FETCH_TIMEOUT_MS = 15e3;
function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  if (init.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

exports.fetchWithTimeout = fetchWithTimeout;

import { debugError } from './debug';
import { safeSetItem, safeGetItem } from './storage';
import { fetchWithRetry } from './fetch';
import { clearAuth } from './auth';

// src/utilis/contestActions.js
// Error-safe fetch wrapper with proper response validation
// Includes timeout and retry logic for resilient network requests

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API = `${API_PROTOCOL}://${window.location.hostname}:8000/api/cmd`;
const ADMIN_API = `${API_PROTOCOL}://${window.location.hostname}:8000/api/admin`;
const STATE_API = `${API_PROTOCOL}://${window.location.hostname}:8000/api/state`;

// ==================== SESSION ID & VERSION HELPERS ====================

const getBoxVersion = (boxId) => {
  const raw = safeGetItem(`boxVersion-${boxId}`);
  const parsed = raw ? parseInt(raw, 10) : null;
  return Number.isNaN(parsed) ? undefined : parsed;
};

const getSessionId = (boxId) => {
  return safeGetItem(`sessionId-${boxId}`);
};

const setSessionId = (boxId, sessionId) => {
  if (sessionId) {
    safeSetItem(`sessionId-${boxId}`, sessionId);
  }
};

// ==================== ERROR HANDLING HELPERS ====================

/**
 * Parse error response from backend
 * @param {Response} response - Fetch response object
 * @returns {Promise<string>} Error message
 */
const getErrorMessage = async (response) => {
  try {
    const errorData = await response.json();
    return errorData.detail || `HTTP ${response.status}: ${response.statusText}`;
  } catch {
    return `HTTP ${response.status}: ${response.statusText}`;
  }
};

/**
 * Validate fetch response and throw if not ok
 * @param {Response} response - Fetch response object
 * @param {string} commandType - Type of command for logging
 * @throws {Error} If response is not ok
 */
const validateResponse = async (response, commandType) => {
  if (!response.ok) {
    const errorMsg = await getErrorMessage(response);
    if (response.status === 401 || response.status === 403) {
      clearAuth(); // token invalid/rol/box neautorizat -> forțează relogin
    }
    const error = new Error(`[${commandType}] ${errorMsg}`);
    error.status = response.status;
    error.commandType = commandType;
    debugError(`Command failed: ${commandType}`, error);
    throw error;
  }
};

// ==================== COMMAND ACTIONS ====================

/**
 * Start the timer for a box
 * @param {number} boxId - Box identifier
 * @throws {Error} If API request fails
 */
export async function startTimer(boxId) {
  try {
    safeSetItem('timer-cmd', JSON.stringify({ type: 'START_TIMER', boxId, ts: Date.now() }));
  } catch (err) {
    debugError('Failed to persist START_TIMER command', err);
  }

  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'START_TIMER',
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'START_TIMER');
    return await response.json();
  } catch (err) {
    debugError('[startTimer] Error:', err);
    throw err;
  }
}

/**
 * Stop the timer for a box
 * @param {number} boxId - Box identifier
 * @throws {Error} If API request fails
 */
export async function stopTimer(boxId) {
  try {
    safeSetItem('timer-cmd', JSON.stringify({ type: 'STOP_TIMER', boxId, ts: Date.now() }));
  } catch (err) {
    debugError('Failed to persist STOP_TIMER command', err);
  }

  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'STOP_TIMER',
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'STOP_TIMER');
    return await response.json();
  } catch (err) {
    debugError('[stopTimer] Error:', err);
    throw err;
  }
}

/**
 * Resume a paused timer for a box
 * @param {number} boxId - Box identifier
 * @throws {Error} If API request fails
 */
export async function resumeTimer(boxId) {
  try {
    safeSetItem('timer-cmd', JSON.stringify({ type: 'RESUME_TIMER', boxId, ts: Date.now() }));
  } catch (err) {
    debugError('Failed to persist RESUME_TIMER command', err);
  }

  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'RESUME_TIMER',
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'RESUME_TIMER');
    return await response.json();
  } catch (err) {
    debugError('[resumeTimer] Error:', err);
    throw err;
  }
}

/**
 * Update progress (holds climbed) for current competitor
 * @param {number} boxId - Box identifier
 * @param {number} delta - Holds to add (positive/negative)
 * @throws {Error} If API request fails
 */
export async function updateProgress(boxId, delta = 1) {
  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'PROGRESS_UPDATE',
          delta,
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'PROGRESS_UPDATE');
    return await response.json();
  } catch (err) {
    debugError('[updateProgress] Error:', err);
    throw err;
  }
}

// ==================== COMPETITION OFFICIALS (ADMIN) ====================

export async function getCompetitionOfficials() {
  const response = await fetchWithRetry(
    `${ADMIN_API}/competition_officials`,
    {
      method: 'GET',
      credentials: 'include',
    },
    3,
    5000,
  );
  await validateResponse(response, 'GET_COMPETITION_OFFICIALS');
  return await response.json();
}

export async function setCompetitionOfficials(judgeChief, competitionDirector, chiefRoutesetter) {
  const response = await fetchWithRetry(
    `${ADMIN_API}/competition_officials`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        judgeChief: judgeChief ?? '',
        competitionDirector: competitionDirector ?? '',
        chiefRoutesetter: chiefRoutesetter ?? '',
      }),
    },
    3,
    5000,
  );
  await validateResponse(response, 'SET_COMPETITION_OFFICIALS');
  return await response.json();
}

/**
 * Request the currently active competitor for a box
 * @param {number} boxId - Box identifier
 * @throws {Error} If API request fails
 */
export async function requestActiveCompetitor(boxId) {
  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'REQUEST_ACTIVE_COMPETITOR',
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'REQUEST_ACTIVE_COMPETITOR');
    return await response.json();
  } catch (err) {
    debugError('[requestActiveCompetitor] Error:', err);
    throw err;
  }
}

/**
 * Submit score for current competitor
 * @param {number} boxId - Box identifier
 * @param {number} score - Final score (holds)
 * @param {string} competitor - Competitor name
 * @param {number | undefined} [registeredTime] - Registered time in seconds (optional)
 * @throws {Error} If API request fails
 */
export async function submitScore(boxId, score, competitor, registeredTime) {
  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'SUBMIT_SCORE',
          score,
          competitor,
          registeredTime: typeof registeredTime === 'number' ? registeredTime : undefined,
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'SUBMIT_SCORE');
    return await response.json();
  } catch (err) {
    debugError('[submitScore] Error:', err);
    throw err;
  }
}

/**
 * Register the time for current competitor
 * @param {number} boxId - Box identifier
 * @param {number} registeredTime - Time to register in seconds
 * @throws {Error} If API request fails
 */
export async function registerTime(boxId, registeredTime) {
  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'REGISTER_TIME',
          registeredTime,
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'REGISTER_TIME');
    return await response.json();
  } catch (err) {
    debugError('[registerTime] Error:', err);
    throw err;
  }
}

/**
 * Initialize a new route in the contest
 * @param {number} boxId - Box identifier
 * @param {number} routeIndex - Route number (1-based)
 * @param {number} holdsCount - Total holds on route
 * @param {Array} competitors - List of competitors
 * @param {string} timerPreset - Timer preset (MM:SS)
 * @throws {Error} If API request fails
 */
export async function initRoute(
  boxId,
  routeIndex,
  holdsCount,
  competitors,
  timerPreset,
  routesCount,
  holdsCounts,
  categorie,
) {
  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'INIT_ROUTE',
          routeIndex,
          holdsCount,
          routesCount,
          holdsCounts,
          competitors,
          timerPreset,
          categorie,
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'INIT_ROUTE');
    return await response.json();
  } catch (err) {
    debugError('[initRoute] Error:', err);
    throw err;
  }
}

/**
 * Set/update the timer preset for a box (admin setup).
 * Persists to backend so all clients (e.g. Judge Remote) update in real time.
 * @param {number} boxId - Box identifier
 * @param {string} timerPreset - Timer preset (MM:SS)
 * @throws {Error} If API request fails
 */
export async function setTimerPreset(boxId, timerPreset) {
  const fetchAndStoreState = async () => {
    const response = await fetchWithRetry(
      `${STATE_API}/${boxId}`,
      {
        method: 'GET',
        credentials: 'include',
      },
      3,
      5000,
    );
    await validateResponse(response, 'GET_STATE');
    const st = await response.json();
    if (st?.sessionId) setSessionId(boxId, st.sessionId);
    if (typeof st?.boxVersion === 'number') {
      safeSetItem(`boxVersion-${boxId}`, String(st.boxVersion));
    }
    return st;
  };

  try {
    let sessionId = getSessionId(boxId);
    let boxVersion = getBoxVersion(boxId);

    if (!sessionId) {
      const st = await fetchAndStoreState();
      sessionId = st?.sessionId;
      boxVersion = typeof st?.boxVersion === 'number' ? st.boxVersion : undefined;
    }

    const doPost = async () => {
      const response = await fetchWithRetry(
        API,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            boxId,
            type: 'SET_TIMER_PRESET',
            timerPreset,
            sessionId,
            boxVersion,
          }),
        },
        3,
        5000,
      );

      await validateResponse(response, 'SET_TIMER_PRESET');
      return await response.json();
    };

    let result = await doPost();
    if (
      result?.status === 'ignored' &&
      (result.reason === 'stale_version' || result.reason === 'stale_session')
    ) {
      await fetchAndStoreState();
      sessionId = getSessionId(boxId);
      boxVersion = getBoxVersion(boxId);
      result = await doPost();
    }
    return result;
  } catch (err) {
    debugError('[setTimerPreset] Error:', err);
    throw err;
  }
}

/**
 * Request state snapshot from backend
 * @param {number} boxId - Box identifier
 * @throws {Error} If API request fails
 */
export async function requestState(boxId) {
  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'REQUEST_STATE',
          sessionId: getSessionId(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'REQUEST_STATE');
    return await response.json();
  } catch (err) {
    debugError('[requestState] Error:', err);
    throw err;
  }
}

/**
 * Reset box state and regenerate sessionId
 * @param {number} boxId - Box identifier
 * @throws {Error} If API request fails
 */
export async function resetBox(boxId) {
  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'RESET_BOX',
          sessionId: getSessionId(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'RESET_BOX');
    return await response.json();
  } catch (err) {
    debugError('[resetBox] Error:', err);
    throw err;
  }
}

/**
 * Partial reset for a box (checkbox-driven).
 * @param {number} boxId - Box identifier
 * @param {{resetTimer?: boolean, clearProgress?: boolean, unmarkAll?: boolean}} opts
 * @throws {Error} If API request fails
 */
export async function resetBoxPartial(boxId, opts = {}) {
  const { resetTimer = false, clearProgress = false, unmarkAll = false } = opts || {};
  try {
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'RESET_PARTIAL',
          resetTimer,
          clearProgress,
          unmarkAll,
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'RESET_PARTIAL');
    return await response.json();
  } catch (err) {
    debugError('[resetBoxPartial] Error:', err);
    throw err;
  }
}

/**
 * Persist manual time tiebreak decision for current eligible top-3 tie event.
 * @param {number} boxId
 * @param {'yes'|'no'} decision
 * @param {string} fingerprint
 * @throws {Error} If API request fails
 */
export async function setTimeTiebreakDecision(boxId, decision, fingerprint) {
  try {
    const normalizedDecision = String(decision || '').trim().toLowerCase();
    const normalizedFingerprint = String(fingerprint || '').trim();
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'SET_TIME_TIEBREAK_DECISION',
          timeTiebreakDecision: normalizedDecision,
          timeTiebreakFingerprint: normalizedFingerprint,
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'SET_TIME_TIEBREAK_DECISION');
    return await response.json();
  } catch (err) {
    debugError('[setTimeTiebreakDecision] Error:', err);
    throw err;
  }
}

/**
 * Persist manual previous-rounds tiebreak decision for current eligible top-3 tie event.
 * @param {number} boxId
 * @param {'yes'|'no'} decision
 * @param {string} fingerprint
 * @param {string[]} order
 * @param {Record<string, number>} ranksByName
 * @throws {Error} If API request fails
 */
export async function setPrevRoundsTiebreakDecision(
  boxId,
  decision,
  fingerprint,
  order = [],
  ranksByName = {},
) {
  try {
    const normalizedDecision = String(decision || '').trim().toLowerCase();
    const normalizedFingerprint = String(fingerprint || '').trim();
    const normalizedOrder = Array.isArray(order)
      ? order
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item, idx, arr) => item && arr.indexOf(item) === idx)
      : [];
    const normalizedRanksByName =
      ranksByName && typeof ranksByName === 'object'
        ? Object.entries(ranksByName).reduce((acc, [name, rank]) => {
            const cleanName = typeof name === 'string' ? name.trim() : '';
            if (!cleanName) return acc;
            const value = Number(rank);
            if (!Number.isFinite(value) || value <= 0) return acc;
            acc[cleanName] = Math.trunc(value);
            return acc;
          }, {})
        : {};
    const response = await fetchWithRetry(
      API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'SET_PREV_ROUNDS_TIEBREAK_DECISION',
          prevRoundsTiebreakDecision: normalizedDecision,
          prevRoundsTiebreakFingerprint: normalizedFingerprint,
          prevRoundsTiebreakOrder: normalizedOrder,
          prevRoundsTiebreakRanksByName: normalizedRanksByName,
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      },
      3,
      5000,
    );

    await validateResponse(response, 'SET_PREV_ROUNDS_TIEBREAK_DECISION');
    return await response.json();
  } catch (err) {
    debugError('[setPrevRoundsTiebreakDecision] Error:', err);
    throw err;
  }
}

// ==================== EXPORTS ====================

export { getSessionId, setSessionId, getBoxVersion };

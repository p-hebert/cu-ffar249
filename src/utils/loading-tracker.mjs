/**
 * @typedef {Object} ResourceConfig
 * @property {string} key
 * @property {boolean} [optional=false]
 * @property {() => Promise<any>} load
 */

/**
 * @typedef {"IDLE" | "LOADING" | "SUCCESS" | "TIMEOUT" | "LOADING_ERROR"} TrackerStatus
 * @typedef {"PENDING" | "LOADING" | "COMPLETE" | "ERROR"} ResourceStatus
 */

/**
 * @typedef {Object} ResourceSnapshot
 * @property {string} key
 * @property {boolean} optional
 * @property {ResourceStatus} status
 * @property {any} error
 * @property {number | null} startedAt
 * @property {number | null} completedAt
 * @property {number | null} durationMs
 */

/**
 * @typedef {Object} TrackerSnapshot
 * @property {TrackerStatus} status
 * @property {number} timeout
 * @property {number | null} startedAt
 * @property {number | null} timeoutAt
 * @property {number | null} finishedAt
 * @property {number | null} elapsedMs
 * @property {boolean} done
 * @property {number} loadingCount
 * @property {number} successCount
 * @property {number} errorCount
 * @property {number} requiredLoadingCount
 * @property {number} requiredSuccessCount
 * @property {number} requiredErrorCount
 * @property {number} optionalLoadingCount
 * @property {number} optionalSuccessCount
 * @property {number} optionalErrorCount
 * @property {ResourceSnapshot[]} resources
 */

export const TRACKER_STATUS = Object.freeze({
  IDLE: "IDLE",
  LOADING: "LOADING",
  SUCCESS: "SUCCESS",
  TIMEOUT: "TIMEOUT",
  LOADING_ERROR: "LOADING_ERROR",
});

export const RESOURCE_STATUS = Object.freeze({
  PENDING: "PENDING",
  LOADING: "LOADING",
  COMPLETE: "COMPLETE",
  ERROR: "ERROR",
});

export default class LoadingTracker {
  /**
   * @param {Object} opts
   * @param {ResourceConfig[]} [opts.resources=[]]
   * @param {number} [opts.timeout=10000]
   */
  constructor({ resources = [], timeout = 10000 } = {}) {
    this.timeout = timeout;

    this._resources = resources.map((resource) => ({
      key: resource.key,
      optional: resource.optional ?? false,
      load: resource.load,

      status: RESOURCE_STATUS.PENDING,
      error: null,
      startedAt: null,
      completedAt: null,
    }));

    /** @type {TrackerStatus} */
    this.status = TRACKER_STATUS.IDLE;

    this.startedAt = null;
    this.timeoutAt = null;
    this.finishedAt = null;

    this._timer = null;
    this._listeners = new Set();
    this._promise = null;
    this._resolvePromise = null;
  }

  /**
   * Start loading all resources.
   * Idempotent: repeated calls return the same promise.
   *
   * @returns {Promise<TrackerSnapshot>}
   */
  load() {
    if (this._promise) {
      return this._promise;
    }

    const now = Date.now();
    this.status = TRACKER_STATUS.LOADING;
    this.startedAt = now;
    this.timeoutAt = now + this.timeout;
    this.finishedAt = null;

    this._promise = new Promise((resolve) => {
      this._resolvePromise = resolve;
    });

    for (const resource of this._resources) {
      resource.status = RESOURCE_STATUS.LOADING;
      resource.error = null;
      resource.startedAt = now;
      resource.completedAt = null;
    }

    this._emit();

    this._timer = setTimeout(() => {
      this._onTimeout();
    }, this.timeout);

    for (const resource of this._resources) {
      Promise.resolve()
        .then(() => resource.load())
        .then(() => {
          this._onResourceComplete(resource);
        })
        .catch((err) => {
          this._onResourceError(resource, err);
        });
    }

    // Edge case: no required resources
    this._evaluate();

    return this._promise;
  }

  /**
   * Subscribe to state changes.
   * Listener is called immediately with the current snapshot.
   *
   * @param {(snapshot: TrackerSnapshot) => void} listener
   * @returns {() => void} unsubscribe
   */
  subscribe(listener) {
    this._listeners.add(listener);
    listener(this.peek());
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Return a snapshot of the current state.
   *
   * @returns {TrackerSnapshot}
   */
  peek() {
    const now = Date.now();

    let loadingCount = 0;
    let successCount = 0;
    let errorCount = 0;

    let requiredLoadingCount = 0;
    let requiredSuccessCount = 0;
    let requiredErrorCount = 0;

    let optionalLoadingCount = 0;
    let optionalSuccessCount = 0;
    let optionalErrorCount = 0;

    const resources = this._resources.map((resource) => {
      switch (resource.status) {
        case RESOURCE_STATUS.LOADING:
          loadingCount += 1;
          if (resource.optional) {
            optionalLoadingCount += 1;
          } else {
            requiredLoadingCount += 1;
          }
          break;

        case RESOURCE_STATUS.COMPLETE:
          successCount += 1;
          if (resource.optional) {
            optionalSuccessCount += 1;
          } else {
            requiredSuccessCount += 1;
          }
          break;

        case RESOURCE_STATUS.ERROR:
          errorCount += 1;
          if (resource.optional) {
            optionalErrorCount += 1;
          } else {
            requiredErrorCount += 1;
          }
          break;

        case RESOURCE_STATUS.PENDING:
        default:
          break;
      }

      return {
        key: resource.key,
        optional: resource.optional,
        status: resource.status,
        error: resource.error,
        startedAt: resource.startedAt,
        completedAt: resource.completedAt,
        durationMs:
          resource.startedAt != null && resource.completedAt != null
            ? resource.completedAt - resource.startedAt
            : null,
      };
    });

    return {
      status: this.status,
      timeout: this.timeout,
      startedAt: this.startedAt,
      timeoutAt: this.timeoutAt,
      finishedAt: this.finishedAt,
      elapsedMs:
        this.startedAt == null
          ? null
          : (this.finishedAt ?? now) - this.startedAt,
      done: this._isFinalStatus(this.status),

      loadingCount,
      successCount,
      errorCount,

      requiredLoadingCount,
      requiredSuccessCount,
      requiredErrorCount,

      optionalLoadingCount,
      optionalSuccessCount,
      optionalErrorCount,

      resources,
    };
  }

  /**
   * Optional convenience method.
   *
   * @returns {boolean}
   */
  isDone() {
    return this._isFinalStatus(this.status);
  }

  /**
   * Reset tracker so it can be reused.
   * Only allowed once the current run is finished or before it starts.
   */
  reset() {
    if (this.status === TRACKER_STATUS.LOADING) {
      throw new Error(
        "Cannot reset LoadingTracker while loading is in progress.",
      );
    }

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    this.status = TRACKER_STATUS.IDLE;
    this.startedAt = null;
    this.timeoutAt = null;
    this.finishedAt = null;
    this._promise = null;
    this._resolvePromise = null;

    for (const resource of this._resources) {
      resource.status = RESOURCE_STATUS.PENDING;
      resource.error = null;
      resource.startedAt = null;
      resource.completedAt = null;
    }

    this._emit();
  }

  /**
   * @private
   * @param {typeof this._resources[number]} resource
   */
  _onResourceComplete(resource) {
    // Ignore duplicate settlement
    if (resource.status !== RESOURCE_STATUS.LOADING) {
      return;
    }

    resource.status = RESOURCE_STATUS.COMPLETE;
    resource.error = null;
    resource.completedAt = Date.now();

    this._emit();
    this._evaluate();
  }

  /**
   * @private
   * @param {typeof this._resources[number]} resource
   * @param {any} err
   */
  _onResourceError(resource, err) {
    // Ignore duplicate settlement
    if (resource.status !== RESOURCE_STATUS.LOADING) {
      return;
    }

    resource.status = RESOURCE_STATUS.ERROR;
    resource.error = err;
    resource.completedAt = Date.now();

    this._emit();
    this._evaluate();
  }

  /**
   * @private
   */
  _onTimeout() {
    if (this._isFinalStatus(this.status)) {
      return;
    }

    const requiredStillLoading = this._resources.some(
      (r) => !r.optional && r.status === RESOURCE_STATUS.LOADING,
    );

    if (requiredStillLoading) {
      this._finalize(TRACKER_STATUS.TIMEOUT);
      return;
    }

    // If timeout fires after success condition was already met but before
    // finalize occurred for some reason, evaluate again.
    this._evaluate();
  }

  /**
   * Evaluate whether the global outcome should finalize.
   *
   * Rules:
   * - Any required resource error before finalization => LOADING_ERROR immediately
   * - All required resources complete before timeout => SUCCESS immediately
   * - Timeout while required resources still loading => TIMEOUT
   *
   * Optional resource failures never change the final outcome.
   *
   * @private
   */
  _evaluate() {
    if (this._isFinalStatus(this.status)) {
      return;
    }

    const required = this._resources.filter((r) => !r.optional);

    const hasRequiredError = required.some(
      (r) => r.status === RESOURCE_STATUS.ERROR,
    );
    if (hasRequiredError) {
      this._finalize(TRACKER_STATUS.LOADING_ERROR);
      return;
    }

    const allRequiredComplete = required.every(
      (r) => r.status === RESOURCE_STATUS.COMPLETE,
    );
    if (allRequiredComplete) {
      this._finalize(TRACKER_STATUS.SUCCESS);
    }
  }

  /**
   * @private
   * @param {TrackerStatus} finalStatus
   */
  _finalize(finalStatus) {
    if (this._isFinalStatus(this.status)) {
      return;
    }

    this.status = finalStatus;
    this.finishedAt = Date.now();

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    const snapshot = this.peek();
    this._emit(snapshot);

    if (this._resolvePromise) {
      this._resolvePromise(snapshot);
      this._resolvePromise = null;
    }
  }

  /**
   * @private
   * @param {TrackerSnapshot} [snapshot]
   */
  _emit(snapshot = this.peek()) {
    for (const listener of this._listeners) {
      listener(snapshot);
    }
  }

  /**
   * @private
   * @param {TrackerStatus} status
   * @returns {boolean}
   */
  _isFinalStatus(status) {
    return (
      status === TRACKER_STATUS.SUCCESS ||
      status === TRACKER_STATUS.TIMEOUT ||
      status === TRACKER_STATUS.LOADING_ERROR
    );
  }
}

export default class AffectStateDeltaLogger {
  constructor(config = {}) {
    this.config = {
      precision: config.precision ?? 3,
      showUnchanged: config.showUnchanged ?? false,
      stateKeys: config.stateKeys ?? null,
      signalKeys: config.signalKeys ?? null,
      useColors: config.useColors ?? true,
    };
  }

  logTick(prevPublicState, nextPublicState) {
    const prevState = prevPublicState?.state ?? {};
    const nextState = nextPublicState?.state ?? {};

    const prevSignals = prevPublicState?.signals ?? {};
    const nextSignals = nextPublicState?.signals ?? {};

    const prevRegime = prevPublicState?.regime ?? "unknown";
    const nextRegime = nextPublicState?.regime ?? "unknown";

    console.log("");
    console.log(this._bold("=== AFFECT TICK ==="));
    console.log(
      `${this._label("regime")} ${this._formatRegime(prevRegime)} ${this._arrowForChange(prevRegime, nextRegime)} ${this._formatRegime(nextRegime)}`,
    );

    this._logSection("state", prevState, nextState, this.config.stateKeys);
    this._logSection(
      "signals",
      prevSignals,
      nextSignals,
      this.config.signalKeys,
    );
  }

  _logSection(sectionName, prevObj, nextObj, whitelist) {
    const keys = whitelist ?? this._collectNumericKeys(prevObj, nextObj);

    if (keys.length === 0) {
      return;
    }

    console.log(this._dim(`-- ${sectionName} --`));

    for (const key of keys) {
      const prev = prevObj[key];
      const next = nextObj[key];

      if (!Number.isFinite(prev) && !Number.isFinite(next)) {
        continue;
      }

      if (!this.config.showUnchanged && prev === next) {
        continue;
      }

      console.log(this._formatDeltaLine(key, prev, next));
    }
  }

  _collectNumericKeys(a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

    return [...keys].filter((key) => {
      const av = a?.[key];
      const bv = b?.[key];
      return Number.isFinite(av) || Number.isFinite(bv);
    });
  }

  _formatDeltaLine(key, prev, next) {
    const safePrev = Number.isFinite(prev) ? prev : 0;
    const safeNext = Number.isFinite(next) ? next : 0;
    const delta = safeNext - safePrev;

    const arrow = this._arrowForNumber(delta);
    const color = this._colorForDelta(delta);

    const prevText = this._num(safePrev);
    const nextText = this._num(safeNext);
    const deltaText = `${delta >= 0 ? "+" : ""}${this._num(delta)}`;

    return `${this._label(key)} ${prevText} ${color}${arrow} ${nextText} (${deltaText})${this._reset()}`;
  }

  _num(value) {
    return Number(value).toFixed(this.config.precision);
  }

  _arrowForNumber(delta) {
    if (delta > 0) return "↑";
    if (delta < 0) return "↓";
    return "→";
  }

  _arrowForChange(prev, next) {
    return prev === next ? "→" : "⇒";
  }

  _formatRegime(value) {
    return this._cyan(String(value));
  }

  _label(text) {
    return this._yellow(`${text}:`).padEnd(18);
  }

  _colorForDelta(delta) {
    if (!this.config.useColors) return "";
    if (delta > 0) return "\x1b[32m";
    if (delta < 0) return "\x1b[31m";
    return "\x1b[90m";
  }

  _bold(text) {
    if (!this.config.useColors) return text;
    return `\x1b[1m${text}\x1b[0m`;
  }

  _dim(text) {
    if (!this.config.useColors) return text;
    return `\x1b[90m${text}\x1b[0m`;
  }

  _yellow(text) {
    if (!this.config.useColors) return text;
    return `\x1b[33m${text}\x1b[0m`;
  }

  _cyan(text) {
    if (!this.config.useColors) return text;
    return `\x1b[36m${text}\x1b[0m`;
  }

  _reset() {
    return this.config.useColors ? "\x1b[0m" : "";
  }
}

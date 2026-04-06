import { BaseScene, SceneRequest } from "src/p5/scene.mjs";
import LoadingTracker from "src/utils/loading-tracker.mjs";

export default class LoadingScene extends BaseScene {
  static key = "loading";
  static label = "Loading";

  /**
   * @param {Object} opts
   * @param {Array<{
   *   key: string,
   *   optional?: boolean,
   *   load: () => Promise<any>
   * }>} opts.resources
   * @param {string} opts.nextScene
   * @param {number} [opts.timeout=10000]
   * @param {string} [opts.title="Loading..."]
   * @param {(snapshot: any) => string | null} [opts.getStatusText]
   */
  constructor({
    resources = [],
    nextScene,
    timeout = 10000,
    title = "Loading...",
    getStatusText = null,
  } = {}) {
    super();

    if (!nextScene) {
      throw new Error("LoadingScene requires a non-empty 'nextScene'");
    }

    this.nextScene = nextScene;
    this.title = title;
    this.getStatusText = getStatusText;

    this.tracker = new LoadingTracker({
      resources,
      timeout,
    });

    this.snapshot = this.tracker.peek();
    this._unsubscribe = null;

    this._started = false;
    this._resolved = false;
    this._pendingRequest = null;
    this._finalSnapshot = null;
  }

  /**
   * @template {BaseScene} Scene
   * @param {import("p5")} p5
   * @param {Scene} prevScene
   */
  onEnter(p5, prevScene) {
    console.log(`Entering '${this.key}' from '${prevScene?.key ?? "<none>"}'`);
  }

  /**
   * @template {BaseScene} Scene
   * @param {import("p5")} p5
   * @param {Scene} nextScene
   */
  onExit(p5, nextScene) {
    console.log(`Exiting '${this.key}' to '${nextScene?.key ?? "<none>"}'`);
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  /**
   * Starts the tracker exactly once.
   *
   * @param {import("p5")} p5
   * @returns {void}
   */
  setup(p5) {
    if (this._started) {
      return;
    }
    this._started = true;

    this._unsubscribe = this.tracker.subscribe((snapshot) => {
      this.snapshot = snapshot;
    });

    this.tracker.load().then((finalSnapshot) => {
      this._finalSnapshot = finalSnapshot;
      this.snapshot = finalSnapshot;
      this._resolved = true;

      switch (finalSnapshot.status) {
        case "SUCCESS":
          this._pendingRequest = new SceneRequest(this.nextScene);
          break;

        case "TIMEOUT":
          throw this._buildFailureError(finalSnapshot);

        case "LOADING_ERROR":
          throw this._buildFailureError(finalSnapshot);

        default:
          throw new Error(
            `LoadingScene received unexpected final status '${finalSnapshot.status}'`,
          );
      }
    });
  }

  /**
   * Draw loader and return SceneRequest once ready.
   *
   * @param {import("p5")} p5
   * @returns {SceneRequest|void}
   */
  draw(p5) {
    this._drawFrame(p5);

    if (this._pendingRequest) {
      const request = this._pendingRequest;
      this._pendingRequest = null;
      return request;
    }
  }

  /**
   * @param {import("p5")} p5
   */
  _drawFrame(p5) {
    const snapshot = this.snapshot;
    const resources = snapshot.resources ?? [];

    const total = resources.length;
    const done = snapshot.successCount + snapshot.errorCount;
    const progress = total > 0 ? done / total : 1;

    const barWidth = Math.min(420, p5.width * 0.7);
    const barHeight = 20;
    const x = (p5.width - barWidth) / 2;
    const y = p5.height * 0.55;

    p5.background(18);
    p5.push();

    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.noStroke();
    p5.fill(245);
    p5.textSize(28);
    p5.text(this.title, p5.width / 2, p5.height * 0.35);

    p5.textSize(14);
    p5.fill(180);
    p5.text(this._getSummaryText(snapshot), p5.width / 2, p5.height * 0.42);

    p5.stroke(90);
    p5.strokeWeight(1);
    p5.fill(35);
    p5.rect(x, y, barWidth, barHeight, 6);

    p5.noStroke();
    p5.fill(230);
    p5.rect(x, y, barWidth * progress, barHeight, 6);

    p5.fill(180);
    p5.textSize(12);
    p5.text(`${done}/${total} resources`, p5.width / 2, y + 42);

    const statusText = this._getStatusText(snapshot);
    if (statusText) {
      p5.fill(155);
      p5.text(statusText, p5.width / 2, y + 68);
    }

    this._drawResourceList(p5, snapshot, x, y + 110, barWidth);

    p5.pop();
  }

  /**
   * @param {import("p5")} p5
   * @param {any} snapshot
   * @param {number} x
   * @param {number} startY
   * @param {number} width
   */
  _drawResourceList(p5, snapshot, x, startY) {
    const resources = snapshot.resources ?? [];
    const maxRows = 8;
    const visible = resources.slice(0, maxRows);

    p5.push();
    p5.textAlign(p5.LEFT, p5.CENTER);
    p5.textSize(12);

    let y = startY;
    for (const resource of visible) {
      let marker;
      let suffix = "";

      switch (resource.status) {
        case "COMPLETE":
          marker = "✓";
          break;
        case "ERROR":
          marker = "✗";
          suffix = resource.optional ? " (optional)" : " (required)";
          break;
        case "LOADING":
          marker = "…";
          suffix = resource.optional ? " (optional)" : "";
          break;
        default:
          marker = "•";
          break;
      }

      if (resource.status === "ERROR") {
        p5.fill(255, 120, 120);
      } else if (resource.status === "COMPLETE") {
        p5.fill(140, 220, 140);
      } else {
        p5.fill(190);
      }

      p5.text(`${marker} ${resource.key}${suffix}`, x, y);
      y += 20;

      if (resource.status === "ERROR") {
        const words = resource.error.message.split(" ");
        let line = "";

        for (let i = 0; i < words.length; i++) {
          const testLine = line.length === 0 ? words[i] : line + " " + words[i];

          if (testLine.length > 80) {
            // Draw the current line and start a new one
            p5.text(line, x + 20, y);
            y += 20;
            line = words[i]; // start new line with current word
          } else {
            line = testLine;
          }
        }

        // Draw any remaining text
        if (line.length > 0) {
          p5.text(line, x + 20, y);
        }
      }
    }

    if (resources.length > visible.length) {
      p5.fill(130);
      p5.text(`+ ${resources.length - visible.length} more`, x, y);
    }

    p5.pop();
  }

  /**
   * @param {any} snapshot
   * @returns {string}
   */
  _getSummaryText(snapshot) {
    if (snapshot.status === "SUCCESS") {
      return "All required resources loaded";
    }
    if (snapshot.status === "TIMEOUT") {
      return "Timed out while waiting for required resources";
    }
    if (snapshot.status === "LOADING_ERROR") {
      return "A required resource failed to load";
    }

    const requiredLoaded = snapshot.requiredSuccessCount ?? 0;
    const requiredLoading = snapshot.requiredLoadingCount ?? 0;
    const requiredErrors = snapshot.requiredErrorCount ?? 0;

    return [
      `Required loaded: ${requiredLoaded}`,
      `Required loading: ${requiredLoading}`,
      `Required errors: ${requiredErrors}`,
    ].join("   •   ");
  }

  /**
   * @param {any} snapshot
   * @returns {string|null}
   */
  _getStatusText(snapshot) {
    if (typeof this.getStatusText === "function") {
      return this.getStatusText(snapshot);
    }

    if (snapshot.status === "LOADING" && snapshot.timeoutAt != null) {
      const remainingMs = Math.max(0, snapshot.timeoutAt - Date.now());
      return `Timeout in ${Math.ceil(remainingMs / 1000)}s`;
    }

    return null;
  }

  /**
   * Builds a readable error with failing resources attached.
   *
   * @param {any} snapshot
   * @returns {Error}
   */
  _buildFailureError(snapshot) {
    const required = (snapshot.resources ?? []).filter((r) => !r.optional);

    const erroredRequired = required.filter((r) => r.status === "ERROR");
    const timedOutRequired = required.filter((r) => r.status === "LOADING");

    let message = `LoadingScene failed with status '${snapshot.status}'.`;

    if (erroredRequired.length > 0) {
      message += ` Required resources that errored: ${erroredRequired
        .map((r) => r.key)
        .join(", ")}.`;
    }

    if (timedOutRequired.length > 0) {
      message += ` Required resources still loading at timeout: ${timedOutRequired
        .map((r) => r.key)
        .join(", ")}.`;
    }

    const error = new Error(message);
    error.name = "LoadingSceneError";
    error.snapshot = snapshot;
    return error;
  }
}

import Button from "src/components/button.mjs";
import { AFFECT_ENGINE_URL } from "src/constants.mjs";
import { BaseScene, SceneRequest } from "src/p5/scene.mjs";
import AffectEngineClient from "src/services/affect-engine";
import FontBook from "src/utils/fonts.mjs";

const AFFECT_OPTIONS = {
  anxiety: {
    label: "Anxiety",
    scenarios: ["Calm", "Uneasy", "Anxious", "Spiraling"],
  },
  burnout: {
    label: "Burnout",
    scenarios: ["Rested", "Loaded", "Burnt", "Crashing"],
  },
  depression: {
    label: "Depression",
    scenarios: ["Light", "Low", "Depressed", "Numb"],
  },
};

export default class MenuScene extends BaseScene {
  static key = "menu";
  static label = "Menu";

  constructor() {
    super();

    this._setupped = false;
    this._fontFamily = null;
    this._titleFont = null;
    this._bodyFont = null;

    this._affectEngineClient = null;

    /**
     * "affect" -> choose engine
     * "scenario" -> choose scenario for selected engine
     * @type {"affect" | "scenario"}
     */
    this.stage = "affect";

    /**
     * @type {"anxiety" | "burnout" | "depression" | null}
     */
    this.selectedAffect = null;

    /** @type {Button[]} */
    this.buttons = [];
  }

  setup(p5) {
    if (this._setupped) {
      this._rebuildButtons(p5);
      return;
    }

    this._affectEngineClient = AffectEngineClient.getInstance({
      url: AFFECT_ENGINE_URL,
    });

    this._fontFamily = FontBook.getFamily("source-sans-3");
    this._titleFont = this._fontFamily?.bold ?? null;
    this._bodyFont = this._fontFamily?.light ?? null;

    this._setupped = true;
    this._rebuildButtons(p5);
  }

  /**
   * @template {BaseScene} Scene
   * @param {import("p5")} p5
   */
  onEnter(p5) {
    this.stage = "affect";
    this.selectedAffect = null;
    this._rebuildButtons(p5);
  }

  /**
   * @template {BaseScene} Scene
   * @param {import("p5")} p5
   * @param {Scene} nextScene
   */
  onExit(p5) {}

  /**
   * @param {import("p5")} p5
   */
  draw(p5) {
    p5.background("black");

    this._drawTitle(p5);
    this._drawSubtitle(p5);

    for (const button of this.buttons) {
      button.draw(p5);
    }
  }

  /**
   * @param {import("p5")} p5
   * @param {MouseEvent} event
   */
  mouseMoved(p5, event) {
    for (const button of this.buttons) {
      button.mouseMoved(p5, event);
    }
  }

  /**
   * @param {import("p5")} p5
   * @param {MouseEvent} event
   */
  mousePressed(p5, event) {
    for (const button of this.buttons) {
      button.mousePressed(p5, event);
    }
  }

  /**
   * @param {import("p5")} p5
   * @param {MouseEvent} event
   * @returns {SceneRequest | void}
   */
  mouseReleased(p5, event) {
    for (const button of this.buttons) {
      const wasClicked = button.mouseReleased(p5, event);
      if (!wasClicked) continue;

      const request = this._handleButtonClick(button, p5, event);
      if (request) return request;
      break;
    }
  }

  /**
   * Optional keyboard support.
   *
   * @param {import("p5")} p5
   * @param {KeyboardEvent} event
   */
  keyPressed(p5, event) {
    if (event.key === "Escape" && this.stage === "scenario") {
      this._goBack(p5);
      return false;
    }
  }

  /**
   * @param {import("p5")} p5
   */
  _drawTitle(p5) {
    p5.push();
    {
      p5.noStroke();
      p5.fill(255);
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(54);

      if (this._titleFont) {
        p5.textFont(this._titleFont);
      }

      p5.text("Pressures", p5.width / 2, 90);
    }
    p5.pop();
  }

  /**
   * @param {import("p5")} p5
   */
  _drawSubtitle(p5) {
    const subtitle =
      this.stage === "affect"
        ? "Choose an affect simulation"
        : `Choose a starting scenario: ${AFFECT_OPTIONS[this.selectedAffect].label}`;

    p5.push();
    {
      p5.noStroke();
      p5.fill(210);
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(24);

      if (this._bodyFont) {
        p5.textFont(this._bodyFont);
      }

      p5.text(subtitle, p5.width / 2, 150);
    }
    p5.pop();
  }

  /**
   * @param {import("p5")} p5
   */
  _rebuildButtons(p5) {
    const buttonWidth = Math.min(420, Math.floor(p5.width * 0.5));
    const buttonHeight = 56;
    const gap = 18;
    const startY = 220;
    const x = Math.floor((p5.width - buttonWidth) / 2);

    const commonStyles = {
      textFont: this._bodyFont,
      textSize: 24,
      radius: 10,
      bgColor: [20, 20, 24],
      hoverBgColor: [40, 40, 48],
      pressedBgColor: [62, 62, 76],
      borderColor: [255, 255, 255, 30],
      textColor: [245, 245, 245],
    };

    this.buttons = [];

    if (this.stage === "affect") {
      const affectKeys = ["anxiety", "burnout", "depression"];

      affectKeys.forEach((affectKey, index) => {
        this.buttons.push(
          new Button({
            x,
            y: startY + index * (buttonHeight + gap),
            w: buttonWidth,
            h: buttonHeight,
            label: AFFECT_OPTIONS[affectKey].label,
            styles: commonStyles,
          }),
        );
      });
      return;
    }

    const scenarios = AFFECT_OPTIONS[this.selectedAffect].scenarios;

    scenarios.forEach((scenarioLabel, index) => {
      this.buttons.push(
        new Button({
          x,
          y: startY + index * (buttonHeight + gap),
          w: buttonWidth,
          h: buttonHeight,
          label: scenarioLabel,
          styles: commonStyles,
        }),
      );
    });

    this.buttons.push(
      new Button({
        x,
        y: startY + scenarios.length * (buttonHeight + gap) + 10,
        w: buttonWidth,
        h: buttonHeight,
        label: "Back",
        styles: {
          ...commonStyles,
          bgColor: [28, 18, 18],
          hoverBgColor: [48, 26, 26],
          pressedBgColor: [72, 34, 34],
        },
      }),
    );
  }

  /**
   * @param {Button} button
   * @param {import("p5")} p5
   * @param {MouseEvent} event
   * @returns {SceneRequest | void}
   */
  _handleButtonClick(button, p5) {
    const label = button.label;

    if (this.stage === "affect") {
      const affectKey = this._getAffectKeyByLabel(label);
      if (!affectKey) return;

      this.selectedAffect = affectKey;
      this.stage = "scenario";
      this._rebuildButtons(p5);
      return;
    }

    if (label === "Back") {
      this._goBack(p5);
      return;
    }

    return this._startScenario(label);
  }

  /**
   * @param {import("p5")} p5
   */
  _goBack(p5) {
    this.stage = "affect";
    this.selectedAffect = null;
    this._rebuildButtons(p5);
  }

  /**
   * @param {string} scenarioLabel
   * @returns {SceneRequest}
   */
  _startScenario(scenarioLabel) {
    const affectKey = this.selectedAffect;
    if (!affectKey) {
      throw new Error("Cannot start scenario without a selected affect");
    }

    // This assumes your AffectEngineClient exposes these methods,
    // which matches the earlier runtime refactor you asked for:
    // - switchEngine(engineKey)
    // - switchScenario(scenarioKey)
    //
    // If your method names differ, only this block needs adjustment.
    try {
      this._affectEngineClient.switchEngine(affectKey);
      this._affectEngineClient.switchScenario(
        this._normalizeScenarioKey(scenarioLabel),
      );
    } catch (error) {
      console.error(
        "Failed to switch affect engine/scenario from menu:",
        error,
      );
    }

    return new SceneRequest("game", "switch");
  }

  /**
   * @param {string} label
   * @returns {"anxiety" | "burnout" | "depression" | null}
   */
  _getAffectKeyByLabel(label) {
    for (const [key, value] of Object.entries(AFFECT_OPTIONS)) {
      if (value.label === label) {
        return /** @type {"anxiety" | "burnout" | "depression"} */ (key);
      }
    }
    return null;
  }

  /**
   * "Spiraling" -> "spiraling"
   * "Loaded" -> "loaded"
   *
   * @param {string} label
   * @returns {string}
   */
  _normalizeScenarioKey(label) {
    return label.trim().toLowerCase().replace(/\s+/g, "_");
  }
}

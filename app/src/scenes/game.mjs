import AffectNoiseFieldDrawable from "src/components/affect/AffectNoiseFieldDrawable.mjs";
import LineInput from "src/components/input.mjs";
import { AFFECT_ENGINE_URL } from "src/constants.mjs";
import { BaseScene } from "src/p5/scene.mjs";
import AffectEngineClient from "src/services/affect-engine";
import FontBook from "src/utils/fonts.mjs";

/**
 * Game Scene
 *
 * TODO: Docs.
 */
export default class GameScene extends BaseScene {
  static key = "game";
  static label = "Game";

  constructor({ enableNoInputInterval = true, tickIntervalMs = 5000 } = {}) {
    super();
    this.input = null;

    this._setupped = false;
    this._fontFamily = null;
    this._submittedTexts = [];
    this._enableNoInputInterval = enableNoInputInterval;
    this._tickIntervalMs = tickIntervalMs;
    this._tickInterval = null;
    this._affectEngineClient = null;
    this._affectDrawable = null;
  }

  /**
   * Load assets
   *
   * @param {import('p5')} p5
   */

  setup(p5) {
    if (this._setupped) {
      return;
    }
    // Get AffectEngineClient
    this._affectEngineClient = AffectEngineClient.getInstance({
      url: AFFECT_ENGINE_URL,
    });

    // Affect visual effects
    this._affectDrawable = new AffectNoiseFieldDrawable({
      width: p5.width,
      height: p5.height,
    });

    // Setup LineInput
    this._fontFamily = FontBook.getFamily("source-sans-3");
    const FONT_SIZE = 32;
    const FONT_PADDING = 2;
    const INPUT_HEIGHT = FONT_SIZE + 2 * FONT_PADDING;
    const INPUT_X_MARGIN = Math.floor(p5.width * 0.1); // 10% on each side
    const INPUT_WIDTH = p5.width - 2 * INPUT_X_MARGIN;

    this.input = new LineInput({
      x: INPUT_X_MARGIN,
      y: p5.height / 2,
      w: INPUT_WIDTH,
      h: INPUT_HEIGHT,
      placeholder: "Share your thoughts",
      onSubmitCallback: (value) => this.onSubmitCallback(value),
      styles: {
        fontPlaceholder: this._fontFamily["light-italic"],
        fontValue: this._fontFamily["light"],
      },
    });

    // Setup an interval such that if the input field has not been modified in the last tickIntervalMs,
    // we submit a "no-input" message to the affect engine to simulate "meditation"/"peace"/"quiet".
    this._tickInterval = setInterval(() => {
      const noInputInInterval =
        this.input.lastTouched === null ||
        Date.now() - this.input.lastTouched > this._tickIntervalMs;
      if (this._enableNoInputInterval && noInputInInterval) {
        console.log("Submitting no-input");
        this.submitTextAndUpdate("");
      }
    }, this._tickIntervalMs);

    this._affectEngineClient
      .getState()
      .then(({ data: { signals, engineType } }) => {
        this._affectDrawable.setAffectState({
          regime: signals.regime,
          signals: signals,
          affectEngine: engineType,
        });
        this._setupped = true;
      });
  }

  enableNoInputInterval() {
    this._enableNoInputInterval = true;
  }

  disableNoInputInterval() {
    this._enableNoInputInterval = false;
  }

  async onSubmitCallback(text) {
    return this.submitTextAndUpdate(text);
  }

  async submitTextAndUpdate(text) {
    if (text === null) return;
    const result = await this._affectEngineClient.submitTextAndWait(text);
    console.log(result);
    this._affectDrawable.setAffectState({
      regime: result.data.signals.regime,
      signals: result.data.signals,
      affectEngine: result.data.engineType,
    });

    if (text !== "") {
      this._submittedTexts.unshift(text);
      if (this._submittedTexts.length > 7) this._submittedTexts.pop();
    }
  }

  /**
   * @template {BaseScene} Scene
   * @param {import('p5')} p5
   * @param {Scene} prevScene
   */
  onEnter(p5, prevScene) {
    console.log(`Entering '${this.key}' from '${prevScene.key}'`);
  }

  /**
   * @param {import('p5')} p5
   */
  draw(p5) {
    p5.background("black");
    if (!this._setupped) {
      return;
    }
    this._affectDrawable.draw(p5);
    this.input.draw(p5);
    this._drawSubmittedTexts(p5);
  }

  _drawSubmittedTexts(p5) {
    p5.push();
    {
      p5.textFont(this.input.styles.fontValue);
      p5.textAlign(p5.LEFT, p5.BASELINE);
      p5.textSize(this.input.styles.fontSize);
      const inputBottomY = this.input.y + this.input.h;

      for (let i = 0; i < this._submittedTexts.length; i += 1) {
        const text = this._submittedTexts[i];
        const textWidth = p5.textWidth(text);
        const textBottomY =
          inputBottomY + (i + 1) * Math.floor(this.input.h * 1.15);
        const textX = this.input.x + this.input.w / 2 - textWidth / 2;
        const textOpacity = 0.5 - i * 0.085;
        p5.fill(255, textOpacity * 255);
        p5.text(text, textX, textBottomY);
      }
    }
    p5.pop();
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mouseMoved(p5, event) {
    this.input.mouseMoved(p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mousePressed(p5, event) {
    this.input.mousePressed(p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mouseReleased(p5, event) {
    this.input.mouseReleased(p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyPressed(p5, event) {
    this.input.keyPressed(p5, event);
    if (this.input.focused) return false;
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyReleased(p5, event) {
    this.input.keyReleased(p5, event);
    if (this.input.focused) return false;
  }

  /**
   * @template {BaseScene} Scene
   * @param {import('p5')} p5
   * @param {Scene} nextScene
   */
  onExit(p5, nextScene) {
    console.log(`Exiting '${this.key}' to '${nextScene.key}'`);
  }
}

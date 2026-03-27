import { BaseScene, SceneRequest } from "src/p5/scene.mjs";
import FontBook from "src/utils/fonts.mjs";

let currentText = "";

/**
 * MainScene
 *
 * TODO: Docs.
 */
export default class GameScene extends BaseScene {
  static key = "game";
  static label = "Game";

  constructor() {
    super();
    this.font = null;
    this._setupped = false;
  }

  /**
   * Load assets
   *
   * @param {import('p5')} p5
   */
  // eslint-disable-next-line no-unused-vars
  setup(p5) {
    if (this._setupped) {
      return;
    }

    FontBook.getPromise("source-sans-3--medium").then((font) => {
      this.font = font;
    });

    this._setupped = true;
    // Preload the sound effects for the Lose/Win scenes
    return [
      new SceneRequest("classic-tag-game.lose", "preload"),
      new SceneRequest("classic-tag-game.win", "preload"),
    ];
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
    p5.background("purple");

    const PLACEHOLDER_TEXT = "Share your thoughts";
    let displayText;
    p5.push();
    {
      if (currentText === "") {
        p5.fill(255, 255, 255, 255 * 0.2);
        p5.textStyle(p5.ITALIC);
        displayText = PLACEHOLDER_TEXT;
      } else {
        displayText = currentText;
      }
      p5.textAlign(p5.CENTER, p5.TOP);
      p5.textSize(32);
      p5.text(displayText, p5.width / 2, p5.height / 2);
    }
    p5.pop();
    const X_MARGIN = Math.floor(p5.width * 0.1); // 10% on each side
    p5.push();
    {
      p5.stroke("fff");
      p5.line(
        X_MARGIN,
        p5.height / 2 + 36,
        p5.width - X_MARGIN,
        p5.height / 2 + 36,
      );
    }
    p5.pop();
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyPressed(p5, event) {
    if (event.key === "Backspace") {
      event.stopPropagation();
      return new SceneRequest("menu");
    }
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

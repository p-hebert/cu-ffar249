import LineInput from "src/components/input.mjs";
import { BaseScene } from "src/p5/scene.mjs";
import FontBook from "src/utils/fonts.mjs";

/**
 * Game Scene
 *
 * TODO: Docs.
 */
export default class GameScene extends BaseScene {
  static key = "game";
  static label = "Game";

  constructor() {
    super();
    this._fontFamily = null;
    this._setupped = false;
    this._text = "";
    this.input = null;
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

    this._fontFamily = FontBook.getFamily("source-sans-3");
    const FONT_SIZE = 32;
    const FONT_PADDING = 2;
    const INPUT_HEIGHT = FONT_SIZE + 2 * FONT_PADDING;
    const INPUT_X_MARGIN = Math.floor(p5.width * 0.1); // 10% on each side
    const INPUT_WIDTH = p5.width - 2 * INPUT_X_MARGIN;

    for (let [style, font] of Object.entries(this._fontFamily)) {
      console.log(style, font, FontBook.isFont(font));
    }
    this.input = new LineInput({
      x: INPUT_X_MARGIN,
      y: p5.height / 2,
      w: INPUT_WIDTH,
      h: INPUT_HEIGHT,
      placeholder: "Share your thoughts",
      onSubmitCallback: (value) => console.log("Submitted", value),
      styles: {
        fontPlaceholder: this._fontFamily["light-italic"],
        fontValue: this._fontFamily["light"],
      },
    });

    this._setupped = true;
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
    this.input.draw(p5);

    // const PLACEHOLDER_TEXT = "Share your thoughts";
    // let displayText;
    // p5.push();
    // {
    //   if (this._text === "") {
    //     p5.fill(255, 255, 255, 255 * 0.2);
    //     if (FontBook.isFont(this._fontFamily?.["black-italic"])) {
    //       p5.textFont(this._fontFamily?.["black-italic"]);
    //     }
    //     displayText = PLACEHOLDER_TEXT;
    //   } else {
    //     p5.fill(255, 255, 255);
    //     if (FontBook.isFont(this._fontFamily?.["regular-italic"])) {
    //       p5.textFont(this._fontFamily?.["regular-italic"]);
    //     }
    //     displayText = this._text;
    //   }
    //   p5.textAlign(p5.CENTER, p5.TOP);
    //   p5.textSize(32);
    //   p5.text(displayText, p5.width / 2, p5.height / 2);
    // }
    // p5.pop();
    // const X_MARGIN = Math.floor(p5.width * 0.1); // 10% on each side
    // p5.push();
    // {
    //   p5.stroke("fff");
    //   p5.line(
    //     X_MARGIN,
    //     p5.height / 2 + 36,
    //     p5.width - X_MARGIN,
    //     p5.height / 2 + 36,
    //   );
    // }
    // p5.pop();
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

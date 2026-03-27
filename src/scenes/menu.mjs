import { BaseScene, SceneRequest } from "src/p5/scene.mjs";
import GameScene from "src/scenes/game.mjs";
import FontBook from "src/utils/fonts.mjs";

const prints = {
  font: 0,
};

/**
 * MenuScene
 *
 * A scene that sets the background black and requests Red/Green/Blue-Scene on
 * R/G/B keypress.
 * Logs enter & exit of scene.
 */
export default class MenuScene extends BaseScene {
  static key = "menu";
  static label = "Menu";

  constructor() {
    super();
    this._setupped = false;
    this._font = null;
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

    FontBook.getPromise("source-sans-3--medium").then((font) => {
      this._font = font;
    });

    this._setupped = true;
  }

  /**
   * Draws the rule text.
   * Requests transition to play scene once duration has been elapsed.
   *
   * @param {import('p5')} p5
   */
  draw(p5) {
    p5.background("black");
    p5.push();
    {
      if (!FontBook.isSentinel(this._font) && this._font !== null) {
        p5.textFont(this._font);
        p5.textStyle(p5.BOLD);
        if (!prints.font) {
          console.log(this._font);
          prints.font += 1;
        }
      }
      p5.fill("white");
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.translate(p5.width / 2, p5.height / 2);
      p5.text(`G: ${GameScene.label} Scene`, 0, 0);
      p5.text("Backspace: Return to menu", 0, 48);
    }
    p5.pop();
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyPressed(p5, event) {
    // if 'ESC', catch the event and switch back to menu
    switch (event.key) {
      case "g":
      case "G":
        return new SceneRequest("game");
      default:
        break;
    }
  }
}

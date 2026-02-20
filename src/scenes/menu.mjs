import { BaseScene, SceneRequest } from "src/p5/scene.mjs";
import BlueScene from "src/scenes/blue.mjs";
import GreenScene from "src/scenes/green.mjs";
import RedScene from "src/scenes/red.mjs";

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
      p5.fill("white");
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.translate(p5.width / 2, p5.height / 2);
      p5.text(`R: ${RedScene.label} Scene`, 0, 0);
      p5.text(`G: ${GreenScene.label} Scene`, 0, 12);
      p5.text(`B: ${BlueScene.label} Scene`, 0, 24);
      p5.text("Backspace: Return to menu", 0, 36);
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
      case "r":
      case "R":
        return new SceneRequest("red");
      case "g":
      case "G":
        return new SceneRequest("green");
      case "b":
      case "B":
        return new SceneRequest("blue");
      default:
        break;
    }
  }
}

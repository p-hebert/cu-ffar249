import P5Runtime from "src/p5/runtime.mjs";
import BlueScene from "src/scenes/blue.mjs";
import GreenScene from "src/scenes/green.mjs";
import MenuScene from "src/scenes/menu.mjs";
import RedScene from "src/scenes/red.mjs";

/**
 * Instantiate the runtime
 */
const RUNTIME = new P5Runtime({
  frameRate: 60,
  width: 800,
  height: 800,
});

const MENU = new MenuScene();
const RED = new RedScene();
const GREEN = new GreenScene();
const BLUE = new BlueScene();

/**
 * Register scenes, with MenuScene as starting scene
 */
RUNTIME.registerScene(MENU, { current: true });
RUNTIME.registerScene(RED);
RUNTIME.registerScene(GREEN);
RUNTIME.registerScene(BLUE);

/**
 * Create a p5 sketch in instance mode, and register the P5Runtime (SceneManager)
 * methods as handlers for the p5 lifecycle methods
 */
new window.p5(
  /**
   * @param {import('p5')} p5
   */
  function sketch(p5) {
    p5.setup = () => RUNTIME.setup(p5);
    p5.draw = () => RUNTIME.draw(p5);
    p5.keyPressed = (event) => RUNTIME.keyPressed(p5, event);
    p5.keyReleased = (event) => RUNTIME.keyReleased(p5, event);
    p5.mouseClicked = (event) => RUNTIME.mouseClicked(p5, event);
    p5.mousePressed = (event) => RUNTIME.mousePressed(p5, event);
    p5.mouseReleased = (event) => RUNTIME.mouseReleased(p5, event);
  },
);

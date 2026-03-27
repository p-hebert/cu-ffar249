import P5Global from "src/p5/global.mjs";
import P5Runtime from "src/p5/runtime.mjs";
import { resources } from "src/resources.mjs";
import GameScene from "src/scenes/game.mjs";
import LoadingScene from "src/scenes/loading.mjs";
import MenuScene from "src/scenes/menu.mjs";

/**
 * Instantiate the runtime
 */
const RUNTIME = new P5Runtime({
  frameRate: 60,
  width: window.innerWidth,
  height: window.innerHeight,
});

const LOADING = new LoadingScene({
  resources: resources,
  nextScene: "menu",
  title: "Loading",
  getStatusText: null,
});
const MENU = new MenuScene();
const GAME = new GameScene();

/**
 * Register scenes, with MenuScene as starting scene
 */
RUNTIME.registerScene(LOADING, { current: true });
RUNTIME.registerScene(MENU);
RUNTIME.registerScene(GAME);

/**
 * Create a p5 sketch in instance mode, and register the P5Runtime (SceneManager)
 * methods as handlers for the p5 lifecycle methods
 */
new window.p5(
  /**
   * @param {import('p5')} p5
   */
  function sketch(p5) {
    p5.setup = () => {
      P5Global.set(p5);
      RUNTIME.setup(p5);
    };
    p5.draw = () => RUNTIME.draw(p5);
    p5.keyPressed = (event) => RUNTIME.keyPressed(p5, event);
    p5.keyReleased = (event) => RUNTIME.keyReleased(p5, event);
    p5.mouseClicked = (event) => RUNTIME.mouseClicked(p5, event);
    p5.mousePressed = (event) => RUNTIME.mousePressed(p5, event);
    p5.mouseReleased = (event) => RUNTIME.mouseReleased(p5, event);
  },
);

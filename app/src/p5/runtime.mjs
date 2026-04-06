import { BaseSceneManager } from "./scene.mjs";

/**
 * P5Runtime
 *
 * A convenience class that extends BaseSceneManager
 * to create the canvas and set the frame rate at setup time.
 *
 * 100% manually implemented.
 */
export default class P5Runtime extends BaseSceneManager {
  constructor({
    frameRate = 60,
    width = window.innerWidth,
    height = window.innerHeight,
  } = {}) {
    super();
    this._frameRate = frameRate ?? 60;
    this._initial_width = width ?? window.innerWidth;
    this._initial_height = height ?? window.innerHeight;
  }

  /**
   *
   * @param {import('p5')} p5
   */
  setup(p5) {
    p5.createCanvas(this._initial_width, this._initial_height);
    p5.frameRate(this._frameRate);
    super.setup(p5);
  }
}

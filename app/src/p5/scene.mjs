/**
 * src/p5/scene.js
 *
 * A p5 scene manager implementation.
 * Supports transitions & preloading via returning SceneRequest from p5 lifecycle
 * methods implemented on scenes.
 *
 * Makes it really easy to implement multi-scene games with a main menu.
 *
 * 100% manually implemented.
 */
import { IP5Lifecycle } from "./interfaces";

/**
 * A simple message to pass from a Scene to a SceneManager
 * telling it we are requesting to preload a scene / switch to another scene.
 *
 * SceneManager interprets returns from P5 lifecycle methods; if a SceneRequest
 * is returned from any lifecycle method, it executes the requested Scene effect
 * (preload / switch).
 */
export class SceneRequest {
  /**
   * @param {string} scene
   * @param {'preload'|'switch'} type
   */
  constructor(scene, type = "switch") {
    this.scene = scene;
    this.type = type;
  }
}

/**
 * Abstract base class for Scenes
 *
 * Extends the IP5Lifecycle while enforcing static (class) attributes at runtime.
 * Also implements the Singleton pattern.
 * Updates the return type of the lifecycle method to support returning either nothing
 * or a SceneRequest.
 */
export class BaseScene extends IP5Lifecycle {
  constructor() {
    // dynamic type check
    if (!new.target.hasOwnProperty("key") || !new.target.key) {
      throw new Error(
        `Scene class '${
          new.target.constructor.key
        }' should have a non-empty static 'key' property`,
      );
    }
    if (!new.target.hasOwnProperty("label") || !new.target.label) {
      throw new Error(
        `Scene class '${
          new.target.constructor.label
        }' should have a non-empty static 'label' property`,
      );
    }
    super();
    this.key = this.constructor.key; // convenience alias
    this.label = this.constructor.label; // convenience alias
  }

  /**
   * @template {BaseScene} Scene
   * @param {import('p5')} p5
   * @param {Scene} prevScene
   */
  onEnter(p5, prevScene) {
    throw new TypeError("Abstract method 'onEnter' must be implemented");
  }

  /**
   * @template {BaseScene} Scene
   * @param {import('p5')} p5
   * @param {Scene} nextScene
   */
  onExit(p5, nextScene) {
    throw new TypeError("Abstract method 'onExit' must be implemented");
  }

  // P5 LIFECYCLE METHODS ==========================================================================

  /**
   *
   * @param {import('p5')} p5
   * @returns {SceneRequest|Array<SceneRequest>|void}
   */
  setup(p5) {
    throw new TypeError("Abstract method 'setup' must be implemented");
  }

  /**
   *
   * @param {import('p5')} p5
   * @returns {SceneRequest|Array<SceneRequest>|void}
   */
  draw(p5) {
    throw new TypeError("Abstract method 'draw' must be implemented");
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   * @returns {SceneRequest|Array<SceneRequest>|void}
   */
  keyPressed(p5, event) {
    throw new TypeError("Abstract method 'keyPressed' must be implemented");
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   * @returns {SceneRequest|Array<SceneRequest>|void}
   */
  keyReleased(p5, event) {
    throw new TypeError("Abstract method 'keyReleased' must be implemented");
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   * @returns {SceneRequest|Array<SceneRequest>|void}
   */
  mouseMoved(p5, event) {
    throw new TypeError("Abstract method 'mouseMoved' must be implemented");
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   * @returns {SceneRequest|Array<SceneRequest>|void}
   */
  mouseClicked(p5, event) {
    throw new TypeError("Abstract method 'mouseClicked' must be implemented");
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   * @returns {SceneRequest|Array<SceneRequest>|void}
   */
  mousePressed(p5, event) {
    throw new TypeError("Abstract method 'mousePressed' must be implemented");
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   * @returns {SceneRequest|Array<SceneRequest>|void}
   */
  mouseReleased(p5, event) {
    throw new TypeError("Abstract method 'mouseReleased' must be implemented");
  }
}

/**
 * SceneManager
 *
 * An engine that manages scenes & scene transitions.
 * To use it, create a SceneManager instance,
 * then register scenes using the registerScene method.
 *
 * It can technically be used directly as a p5 sketch, but does not create a canvas
 * in the setup method. For that, see P5Runtime, a convenience class that
 * creates the canvas with a set size & frame rate.
 *
 * Previously a singleton, but then I realized that I prefered to have
 * each game be a SceneManager because it would allow me to have a "Game" extends SceneManager
 * and have start, middle, end scenes for each game.
 *
 * @see ./runtime.js:P5Runtime
 */
export class BaseSceneManager extends IP5Lifecycle {
  constructor({ root = true } = {}) {
    super();
    /**
     * @template {BaseScene} Scene
     * @template {BaseSceneManager} SceneManager
     * @type {Scene|SceneManager|null}
     */
    this.current = null;
    /**
     * @template {BaseScene} Scene
     * @template {BaseSceneManager} SceneManager
     * @type {Map<string, Scene|SceneManager>}
     */
    this.scenes = new Map();
    this.root = root ?? true;
  }

  // SCENE REGISTRY ================================================================================

  /**
   * Adds a scene to the SceneManager
   * @template {BaseScene} Scene
   * @template {BaseSceneManager} SceneManager
   * @param {Scene|SceneManager} scene
   */
  registerScene(scene, { current = false } = {}) {
    const key = scene.key ?? scene.constructor.key;
    if (this.scenes.has(key)) {
      throw new Error(`SceneManager already has a scene keyed '${key}'`);
    }
    if (scene.constructor === BaseScene) {
      throw new Error(`Cannot register instance of abstract class BaseScene`);
    }
    this.scenes.set(key, scene);
    if (current) {
      this.setCurrentScene(key);
    }
  }

  /**
   * Removes a scene from the SceneManager
   * @param {string} key
   */
  unregisterScene(key) {
    if (this.scenes.has(key)) {
      this.scenes.delete(key);
      return;
    }
  }

  /**
   * Checks for existence of a scene
   * @param {string} key
   */
  hasScene(key) {
    return this.scenes.has(key);
  }

  /**
   * Getter for a scene
   * @template {BaseScene} Scene
   * @template {BaseSceneManager} SceneManager
   * @param {string} key
   * @returns {Scene|SceneManager} Scene|SceneManager matching key
   */
  getScene(key) {
    if (!this.scenes.has(key)) {
      throw new Error(`Unknown scene '${key}'`);
    }
    return this.scenes.get(key);
  }

  /**
   * Getter for current scene
   * @template {BaseScene} Scene
   * @template {BaseSceneManager} SceneManager
   * @returns {Scene|SceneManager|null} Current scene if set, else null
   */
  getCurrentScene() {
    return this.current;
  }

  /**
   * Sets current scene to a scene registered under 'key'
   * @param {string} key
   */
  setCurrentScene(key) {
    if (!this.scenes.has(key)) {
      throw new Error(`Unknown scene '${key}'`);
    }
    this.current = this.scenes.get(key);
    // Expose current scene on window app for debugging
    if (window.app && typeof window.app === "object") {
      window.app.currentScene = this.current;
    }
  }

  // P5 LIFECYCLE METHODS ==========================================================================

  /**
   * Delegates the execution of the lifecycle method to the current scene
   * and switches scene if the returned value is a SceneRequest instance.
   * Supports receiving multiple SceneRequest to be able to preload multiple scenes in parallel.
   *
   * @param {string} method Lifecycle method
   * @param {import('p5')} p5
   * @param {...any} args
   * @returns {SceneRequest|null}
   */
  _lifecycle(method, p5, ...args) {
    const currentScene = this.getCurrentScene();
    const currentIsManager = currentScene instanceof BaseSceneManager;
    // only run if the method exists on scene class
    if (currentIsManager || hasInstanceMethod(currentScene, method)) {
      let result = currentScene[method](p5, ...args);
      if (result instanceof SceneRequest) {
        result = [result];
      }

      const unknownRequests = [];

      if (
        Array.isArray(result) &&
        result.every((e) => e instanceof SceneRequest)
      ) {
        for (const request of result) {
          // This block enables returning a SceneRequest to a parent
          // BaseSceneManager if the current SceneManager does not
          // have any scene of the name request.scene registered.
          // This allows for Games to extend BaseSceneManager and delegate
          // to the global BaseSceneManager if one of the scene requests
          // a Scene out of the Game.
          let requestedScene;
          let requestedIsManager;
          try {
            requestedScene = this.getScene(request.scene);
            requestedIsManager = requestedScene instanceof BaseSceneManager;
          } catch (error) {
            if (this.root) throw error;
            unknownRequests.push(request);
            continue;
          }

          switch (request.type) {
            case "preload": {
              if (
                requestedIsManager ||
                hasInstanceMethod(requestedScene, "setup")
              )
                requestedScene.setup(p5);
              break;
            }
            case "switch": {
              if (
                requestedIsManager ||
                hasInstanceMethod(requestedScene, "setup")
              )
                requestedScene.setup(p5);

              if (currentIsManager || hasInstanceMethod(currentScene, "onExit"))
                currentScene.onExit(p5, requestedScene);

              if (
                requestedIsManager ||
                hasInstanceMethod(requestedScene, "onEnter")
              )
                requestedScene.onEnter(p5, currentScene);
              this.setCurrentScene(request.scene);
              break;
            }
            default:
              break;
          }
        }
      }
      if (unknownRequests.length) {
        return unknownRequests;
      }
    }
  }

  /**
   * Callback to execute when transitioning to a Scene/SceneManager
   * @param {import('p5')} p5
   * @param {Scene|SceneManager|null} prevScene Exiting scene, if previously set
   */
  onEnter(p5, prevScene) {
    return this._lifecycle("onEnter", p5, prevScene);
  }

  /**
   * Callback to execute when exiting a Scene/sceneManager
   * @param {import('p5')} p5
   * @param {Scene|SceneManager|null} nextScene Exiting scene, if previously set
   */
  onExit(p5, nextScene) {
    return this._lifecycle("onExit", p5, nextScene);
  }

  /**
   * @param {import('p5')} p5
   */
  setup(p5) {
    return this._lifecycle("setup", p5);
  }

  /**
   *
   * @param {import('p5')} p5
   */
  draw(p5) {
    return this._lifecycle("draw", p5);
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyPressed(p5, event) {
    return this._lifecycle("keyPressed", p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyReleased(p5, event) {
    return this._lifecycle("keyReleased", p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mouseMoved(p5, event) {
    return this._lifecycle("mouseMoved", p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mouseClicked(p5, event) {
    return this._lifecycle("mouseClicked", p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mousePressed(p5, event) {
    return this._lifecycle("mousePressed", p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mouseReleased(p5, event) {
    return this._lifecycle("mouseReleased", p5, event);
  }
}

/**
 * hasInstanceMethod
 * Checks if the object's class has an implementation of the method named {method}.
 *
 * @param {any} obj
 * @param {string} method
 */
function hasInstanceMethod(obj, method) {
  return (
    Object.getPrototypeOf(obj).hasOwnProperty(method) &&
    typeof obj[method] === "function"
  );
}

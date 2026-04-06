/**
 * Simple P5 container
 * Makes it easier to move p5 around if p5 is not readily
 * available in the call flow.
 */
export default class P5Global {
  /** @type {import('p5')} */
  static #_p5 = null;

  /**
   * Setter
   * @param {import('p5')}
   */
  static set(p5) {
    P5Global.#_p5 = p5;
  }
  /**
   * Getter
   * @returns {import('p5')}
   */
  static get() {
    if (P5Global.#_p5 === null) {
      throw new Error(
        "P5Global has not been initialized. Call set(p5) first to set p5.",
      );
    }
    return P5Global.#_p5;
  }
}

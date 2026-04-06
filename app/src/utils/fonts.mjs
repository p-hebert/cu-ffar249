/**
 * @typedef {import('p5').Font} P5Font
 */

/**
 * Centralized FontBook.
 *
 * Font loading subsystem with caching support to avoid loading a font multiple time.
 * Allows to load fonts from ttf/otf files asynchronously, and to poll the result of the loading
 * either synchronously/asynchronously via sentinel values.
 *
 * 100% manually implemented.
 */
export default class FontBook {
  /**
   * Unique sentinel for "loading"
   * @type {symbol}
   */
  static LoadingSentinel = Symbol("FontLoading");

  /**
   * Unique sentinel for "error"
   * @type {symbol}
   */
  static ErrorSentinel = Symbol("FontError");

  /**
   * Fonts
   * @type {Map<string, P5Font | symbol>}
   */
  static _fonts = new Map();

  /**
   * Font Promises
   * @type {Map<string, Promise<P5Font>>}
   */
  static _fontPromises = new Map();

  /**
   * Start loading a font (if not already started).
   * Returns the internal Promise, but callers don't *have* to use it.
   *
   * @param {import('p5')} p5
   * @param {string} key
   * @param {string} path
   * @returns {Promise<P5Font>}  // mainly for tests / advanced callers
   */
  static load(p5, key, path) {
    if (FontBook._fontPromises.has(key)) {
      return FontBook._fontPromises.get(key);
    }

    // mark as loading in the sync map
    FontBook._fonts.set(key, FontBook.LoadingSentinel);

    const promise = new Promise((resolve, reject) => {
      p5.loadFont(
        path,
        (font) => {
          FontBook._fonts.set(key, font);
          resolve(font);
        },
        (err) => {
          FontBook._fonts.set(key, FontBook.ErrorSentinel);
          reject(err);
        },
      );
    });

    // Catch rejections to avoid 'unhandled rejection' warnings.
    promise.catch((err) => {
      console.error(`FontBook: Failed to load font "${key}":`, err);
    });

    FontBook._fontPromises.set(key, promise);
    return promise;
  }

  /**
   * Synchronous getter.
   *
   * @param {string} key
   * @returns {P5Font | typeof FontBook.LoadingSentinel | typeof FontBook.ErrorSentinel | null}
   */
  static get(key) {
    return FontBook._fonts.get(key) ?? null;
  }

  /**
   *
   * @param {string} prefix
   * @returns {Object<string, P5Font>} Available font styles for family
   */
  static getFamily(prefix) {
    const fontStyles = {};
    for (const [key, font] of FontBook._fonts.entries()) {
      if (key.startsWith(prefix)) {
        fontStyles[key.replace(prefix + "--", "")] = font;
      }
    }
    return fontStyles;
  }

  /**
   * Synchronous getter of loading Promise.
   *
   * @param {string} key
   * @returns {Promise<P5Font>}
   */
  static getPromise(key) {
    return FontBook._fontPromises.get(key) ?? null;
  }

  static isFont(obj) {
    return (
      typeof obj?.font?.glyphs === "object" && !(obj?.font?.glyphs === null)
    );
  }

  static isSentinel(obj) {
    return obj === FontBook.LoadingSentinel || obj === FontBook.ErrorSentinel;
  }
}

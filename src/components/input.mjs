import BaseInteractiveInput from "src/p5/components/input.mjs";
import FontBook from "src/utils/fonts.mjs";

/**
 * @typedef {import('p5').Font} P5Font
 */

/**
 * @callback onSubmitCallback
 * @param {string} value Input text value
 */

export default class LineInput extends BaseInteractiveInput {
  /**
   * @param {{
   *   x: number,
   *   y: number,
   *   w: number,
   *   h: number,
   *   value?: string,
   *   placeholder?: string,
   *   onSubmitCallback?: onSubmitCallback,
   *   styles: {
   *     padding: number,
   *     fontPlaceholder: P5Font,
   *     fontValue: P5Font,
   *   }
   * }} options
   */
  constructor(options) {
    super({ value: options.value });

    this.x = options.x;
    this.y = options.y;
    this.w = options.w;
    this.h = options.h;
    this.value = options.value ?? null;
    this.placeholder = options.placeholder;
    this.styles = options.styles ?? {};
    this._onSubmitCallback = options.onSubmitCallback ?? (() => {});
    this._focusedDuration = null;
  }

  get opacity() {
    if (this.disabled) {
      return 0.2;
    } else if (this.pressed) {
      return 0.8;
    } else if (this.focused) {
      return 1;
    } else if (this.hovered) {
      return 0.6;
    } else {
      return 0.5;
    }
  }

  get cursor() {
    return this.focused && this._focusedDuration % 1000 <= 500 ? "|" : "";
  }

  /**
   * @param {import('p5')} p5
   */
  setup(p5) {
    // Optional subclass setup
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  containsPoint(x, y) {
    return (
      x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h
    );
  }

  /**
   * @param {import('p5')} p5
   */
  draw(p5) {
    if (this.focused) {
      this._focusedDuration += p5.deltaTime;
    }
    p5.push();
    {
      // Rendering input field
      p5.fill(255, this.opacity * 255);
      p5.noStroke();
      p5.rect(this.x, this.y + this.h, this.w, 1);

      // Rendering text
      // Preparing text styles
      p5.fill(255, this.opacity * 255);
      if (
        this.value === null &&
        FontBook.isFont(this.styles?.fontPlaceholder)
      ) {
        p5.textFont(this.styles.fontPlaceholder);
      } else if (FontBook.isFont(this.styles?.fontValue)) {
        p5.textFont(this.styles.fontValue);
      }
      p5.textAlign(p5.CENTER, p5.BASELINE);
      p5.textSize(this.h - (this.styles?.padding ?? 2) - 1); // -1: bottom line

      if (this.disabled) {
        // NOT IMPLEMENTED
      } else if (this.focused) {
        const textCenterX = this.x + this.w / 2;
        const textBottomY = this.y + this.h / 2;
        const textWidth = !this.value ? 0 : p5.textWidth(this.value);

        p5.text(this.value ?? "", textCenterX, textBottomY);
        const cursor = this.cursor;
        const cursorCenterX =
          textCenterX + textWidth / 2 + p5.textWidth(cursor) / 2;
        p5.text(this.cursor, cursorCenterX, textBottomY);
      } else {
        p5.text(
          this.value === null ? this.placeholder : this.value,
          this.x + this.w / 2,
          this.y + this.h / 2,
        );
      }
    }
    p5.pop();
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  onSubmit(p5, event) {
    this._onSubmitCallback(this.value);
    this.value = null;
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  onFocus(p5, event) {
    this._focusedDuration = 0;
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  onBlur(p5, event) {
    this._focusedDuration = null;
  }
}

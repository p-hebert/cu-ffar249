import BaseInteractiveInput from "src/p5/components/input.mjs";
import FontBook from "src/utils/fonts.mjs";

/**
 * @typedef {import('p5').Font} P5Font
 */

/**
 * @callback onSubmitCallback
 * @param {string | null} value Input text value
 */

export default class LineInput extends BaseInteractiveInput {
  /**
   * @param {{
   *   x: number,
   *   y: number,
   *   w: number,
   *   h: number,
   *   value?: string | null,
   *   placeholder?: string,
   *   onSubmitCallback?: onSubmitCallback,
   *   styles?: {
   *     padding?: number,
   *     fontPlaceholder?: P5Font,
   *     fontValue?: P5Font,
   *     selectionFill?: [number, number, number, number?] | number[],
   *   },
   *   enableClipboardShortcuts?: boolean,
   *   enableSelectionShortcuts?: boolean,
   *   enableWordNavigationShortcuts?: boolean,
   *   enableBoundaryNavigationShortcuts?: boolean,
   *   enableSelectAllShortcut?: boolean,
   * }} options
   */
  constructor(options) {
    super({
      value: options.value,
      placeholder: options.placeholder,
      enableClipboardShortcuts: options.enableClipboardShortcuts ?? true,
      enableSelectionShortcuts: options.enableSelectionShortcuts ?? true,
      enableWordNavigationShortcuts:
        options.enableWordNavigationShortcuts ?? true,
      enableBoundaryNavigationShortcuts:
        options.enableBoundaryNavigationShortcuts ?? true,
      enableSelectAllShortcut: options.enableSelectAllShortcut ?? true,
    });

    this.x = options.x;
    this.y = options.y;
    this.w = options.w;
    this.h = options.h;
    this.placeholder = options.placeholder ?? null;
    this.styles = options.styles ?? {};
    this._onSubmitCallback = options.onSubmitCallback ?? (() => {});
    this._focusedDuration = this.focused ? 0 : null;
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

  get cursorVisible() {
    return (
      this.focused &&
      this._focusedDuration !== null &&
      this._focusedDuration % 1000 <= 500
    );
  }

  /**
   * @param {import('p5')} p5
   */
  setup(p5) {}

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
   * Returns the text that should be drawn.
   *
   * @returns {string}
   */
  getDisplayText() {
    if (!this.focused && !this.value) {
      return this.placeholder ?? "";
    }

    return this.value ?? "";
  }

  /**
   * @param {import('p5')} p5
   */
  _applyTextStyles(p5) {
    if (!this.focused && !this.value) {
      if (FontBook.isFont(this.styles?.fontPlaceholder)) {
        p5.textFont(this.styles.fontPlaceholder);
      }
    } else if (FontBook.isFont(this.styles?.fontValue)) {
      p5.textFont(this.styles.fontValue);
    }

    p5.textAlign(p5.LEFT, p5.BASELINE);
    p5.textSize(this.h - 2 * (this.styles?.padding ?? 2) - 1);
  }

  /**
   * @param {import('p5')} p5
   */
  draw(p5) {
    if (this.focused && this._focusedDuration !== null) {
      this._focusedDuration += p5.deltaTime;
    }

    const padding = this.styles?.padding ?? 2;
    const displayText = this.getDisplayText();

    p5.push();
    {
      // Underline
      p5.fill(255, this.opacity * 255);
      p5.noStroke();
      p5.rect(this.x, this.y + this.h, this.w, 1);

      this._applyTextStyles(p5);

      const textBottomY = this.y + this.h / 2;
      const textWidth = p5.textWidth(displayText);
      const textX = this.x + this.w / 2 - textWidth / 2;

      // Selection highlight (only over actual value while focused)
      if (this.focused && this.hasSelection && this.value) {
        const before = this.value.slice(0, this.selectionStart);
        const selected = this.value.slice(
          this.selectionStart,
          this.selectionEnd,
        );

        const selX = textX + p5.textWidth(before);
        const selW = p5.textWidth(selected);

        const selectionFill = this.styles?.selectionFill ?? [255, 255, 255, 64];
        p5.noStroke();
        p5.fill(...selectionFill);
        p5.rect(selX, this.y - 5, selW, textBottomY + 2 - (this.y - 5));
      }

      // Text
      p5.fill(255, this.opacity * 255);
      p5.text(displayText, textX, textBottomY);

      // Caret
      if (this.focused && this.cursorVisible) {
        const beforeCursor = (this.value ?? "").slice(0, this.cursorIndex);
        const caretX = textX + p5.textWidth(beforeCursor);

        p5.stroke(255, this.opacity * 255);
        // FIXME: Offsets (0,-5,0,+2) are not dynamically calculated.
        p5.line(caretX, this.y - 5, caretX, textBottomY + 2);
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
    this.clear();
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  onFocus(p5, event) {
    this._focusedDuration = 0;
    this.moveCursorToEnd(false);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  onBlur(p5, event) {
    this._focusedDuration = null;
  }
}

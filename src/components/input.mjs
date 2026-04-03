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

    /**
     * Width of each prefix slice:
     * prefixWidths[i] = width of text.slice(0, i)
     * so prefixWidths.length === text.length + 1
     *
     * @type {number[]}
     */
    this._prefixWidths = [0];

    /**
     * Cached display metrics used both for rendering and hit-testing.
     * @type {{ textX: number, textWidth: number, textBottomY: number } | null}
     */
    this._layoutCache = null;
  }

  get opacity() {
    if (this.disabled) {
      return 0.2;
    } else if (this.pressed && !this.focused) {
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
   * Resolve the nearest caret index from the current mouse position.
   *
   * Uses actual input text, not placeholder text.
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   * @returns {number}
   */
  getCursorIndexFromMouse(p5, event) {
    this._rebuildTextMetrics(p5);

    const text = this.text;

    // Empty input => only valid caret position is 0
    if (text.length === 0) {
      return 0;
    }

    const textX = this._layoutCache?.textX ?? this.x;
    const localX = p5.mouseX - textX;

    // Clamp to bounds outside the text
    if (localX <= 0) return 0;

    const totalWidth = this._prefixWidths[text.length];
    if (localX >= totalWidth) return text.length;

    // Find the closest caret slot between prefix i and prefix i+1
    for (let i = 0; i < text.length; i++) {
      const left = this._prefixWidths[i];
      const right = this._prefixWidths[i + 1];
      const midpoint = (left + right) / 2;

      if (localX < midpoint) {
        return i;
      }

      if (localX >= midpoint && localX < right) {
        return i + 1;
      }
    }

    return text.length;
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
      this._rebuildTextMetrics(p5);

      const padding = this.styles?.padding ?? 2;
      const displayText = this.getDisplayText();
      const { textX, textBottomY } = this._layoutCache;

      // Selection highlight (only over actual value while focused)
      if (this.focused && this.hasSelection && this.text.length > 0) {
        const selX = textX + this._prefixWidths[this.selectionStart];
        const selW =
          this._prefixWidths[this.selectionEnd] -
          this._prefixWidths[this.selectionStart];

        const selectionFill = this.styles?.selectionFill ?? [255, 255, 255, 64];
        p5.noStroke();
        p5.fill(...selectionFill);
        p5.rect(selX, this.y - 5, selW, textBottomY + padding - (this.y - 5));
      }

      // Text
      p5.fill(255, this.opacity * 255);
      p5.text(displayText, textX, textBottomY);

      // Caret
      if (this.focused && this.cursorVisible) {
        const caretX = textX + this._prefixWidths[this.cursorIndex];

        p5.stroke(255, this.opacity * 255);
        // FIXME: Offsets (0,-5,0,+2) are not dynamically calculated.
        p5.line(caretX, this.y - 5, caretX, textBottomY + padding);
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
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  onBlur(p5, event) {
    this._focusedDuration = null;
  }

  /**
   * Recompute cached prefix widths for the current actual input text.
   *
   * @param {import('p5')} p5
   */
  _rebuildPrefixWidths(p5) {
    const text = this.text;
    this._prefixWidths = new Array(text.length + 1);
    this._prefixWidths[0] = 0;

    for (let i = 1; i <= text.length; i++) {
      this._prefixWidths[i] = p5.textWidth(text.slice(0, i));
    }
  }

  /**
   * Recompute text layout data used for both draw and click hit-testing.
   *
   * @param {import('p5')} p5
   */
  _rebuildTextLayoutCache(p5) {
    const displayText = this.getDisplayText();
    const textWidth = p5.textWidth(displayText);
    const textBottomY = this.y + this.h / 2;
    const textX = this.x + this.w / 2 - textWidth / 2;

    this._layoutCache = {
      textX,
      textWidth,
      textBottomY,
    };
  }

  /**
   * Recompute text measurement caches.
   *
   * @param {import('p5')} p5
   */
  _rebuildTextMetrics(p5) {
    this._applyTextStyles(p5);
    this._rebuildPrefixWidths(p5);
    this._rebuildTextLayoutCache(p5);
  }
}

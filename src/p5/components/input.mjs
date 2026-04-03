import {
  IP5Clickable,
  IP5Focusable,
  IP5Hoverable,
  IP5Lifecycle,
  IP5TextInput,
} from "src/p5/interfaces.mjs";

/**
 * BaseInteractiveInput
 *
 * Reusable interaction base for input-like p5 components.
 *
 * Responsibilities:
 * - hover state
 * - press state
 * - focus state
 * - click-to-focus
 * - click-inside / click-outside behavior
 * - minimal text-input plumbing
 *
 * Child classes must implement:
 * - setup(p5)
 * - draw(p5)
 * - containsPoint(x, y)
 *
 * Child classes may override:
 * - onFocus
 * - onBlur
 * - onClick
 * - onHoverStart
 * - onHoverEnd
 * - onPressStart
 * - onPressEnd
 * - onSubmit
 * - insertText
 * - backspace
 */
export default class BaseInteractiveInput extends IP5Lifecycle {
  /**
   * @param {{
   *   disabled?: boolean,
   *   blurOnOutsideClick?: boolean,
   *   focusOnClick?: boolean,
   *   permanentFocus?: boolean,
   *   submitOnEnter?: boolean,
   *   value?: string,
   * }} [options]
   */
  constructor(options = {}) {
    super();

    this.disabled = options.disabled ?? false;

    this.hovered = false;
    this.focused = options.permanentFocus ?? false;
    this.pressed = false;

    this.blurOnOutsideClick = options.blurOnOutsideClick ?? true;
    this.focusOnClick = options.focusOnClick ?? true;
    this.permanentFocus = options.permanentFocus ?? false;
    this.submitOnEnter = options.submitOnEnter ?? true;

    this.value = options.value ?? null;
  }

  clear() {
    this.value = null;
  }

  /**
   * Must be implemented by child class.
   *
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  containsPoint(x, y) {
    throw new TypeError("Abstract method 'containsPoint' must be implemented");
  }

  /**
   * @param {import('p5')} p5
   * @returns {boolean}
   */
  isHovered(p5) {
    if (this.disabled) return false;
    return this.containsPoint(p5.mouseX, p5.mouseY);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  focus(p5, event = null) {
    if (this.disabled || this.focused) return;

    this.focused = true;
    this.onFocus(p5, event);
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  blur(p5, event = null) {
    if (this.permanentFocus) return;
    if (!this.focused) return;

    this.focused = false;
    this.pressed = false;
    this.onBlur(p5, event);
  }

  /**
   * Semantic click hook.
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  click(p5, event) {
    if (this.disabled) return;
    this.onClick(p5, event);
  }

  /**
   * Default text insertion behavior.
   *
   * Child classes can override to support cursor position, selection, etc.
   *
   * @param {import('p5')} p5
   * @param {string} text
   * @param {KeyboardEvent} event
   */
  insertText(p5, text, event) {
    if (this.disabled || !this.focused) return;
    if (this.value === null) this.value = text;
    else this.value += text;
  }

  /**
   * Default backspace behavior.
   *
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  backspace(p5, event) {
    if (this.disabled || !this.focused) return;
    this.value = this.value.slice(0, -1);
    if (this.value === "") this.value = null;
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mouseMoved(p5, event) {
    if (this.disabled) {
      if (this.hovered) {
        this.hovered = false;
        this.onHoverEnd(p5, event);
      }
      return;
    }

    const nowHovered = this.isHovered(p5);

    if (nowHovered && !this.hovered) {
      this.hovered = true;
      this.onHoverStart(p5, event);
    } else if (!nowHovered && this.hovered) {
      this.hovered = false;
      this.onHoverEnd(p5, event);
    }
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mousePressed(p5, event) {
    if (this.disabled) return;

    const inside = this.containsPoint(p5.mouseX, p5.mouseY);

    if (inside) {
      this.pressed = true;
      this.onPressStart(p5, event);

      if (this.focusOnClick) {
        this.focus(p5, event);
      }
    } else if (this.blurOnOutsideClick) {
      this.blur(p5, event);
    }
  }

  /**
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  mouseReleased(p5, event) {
    if (this.disabled) return;

    const wasPressed = this.pressed;
    const inside = this.containsPoint(p5.mouseX, p5.mouseY);

    if (this.pressed) {
      this.pressed = false;
      this.onPressEnd(p5, event);
    }

    if (wasPressed && inside) {
      this.click(p5, event);
    }
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyPressed(p5, event) {
    if (this.disabled || !this.focused) return;

    // Prevent browser shortcuts / default text-navigation behavior
    if (event.key === "'" || event.key === "/" || event.key === "Backspace") {
      event.preventDefault();
    }

    if (event.key === "Backspace") {
      this.backspace(p5, event);
      return;
    }

    if (event.key === "Enter") {
      if (this.submitOnEnter) {
        this.onSubmit(p5, event);
      }
      return;
    }

    if (event.key.length === 1) {
      this.insertText(p5, event.key, event);
    }
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyReleased(p5, event) {
    if (this.disabled || !this.focused) return;

    // Prevent browser shortcuts / default text-navigation behavior
    if (event.key === "'" || event.key === "/" || event.key === "Backspace") {
      event.preventDefault();
    }
  }

  /**
   * Hook: hover entered
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  onHoverStart(p5, event) {}

  /**
   * Hook: hover left
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  onHoverEnd(p5, event) {}

  /**
   * Hook: focus gained
   *
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  onFocus(p5, event) {}

  /**
   * Hook: focus lost
   *
   * @param {import('p5')} p5
   * @param {MouseEvent | KeyboardEvent | null} event
   */
  onBlur(p5, event) {}

  /**
   * Hook: mouse press started inside component
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  onPressStart(p5, event) {}

  /**
   * Hook: mouse press ended after prior inside press
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  onPressEnd(p5, event) {}

  /**
   * Hook: semantic click
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   */
  onClick(p5, event) {}

  /**
   * Hook: enter pressed while focused
   *
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  onSubmit(p5, event) {}
}

Object.assign(
  BaseInteractiveInput.prototype,
  IP5Hoverable.prototype,
  IP5Focusable.prototype,
  IP5Clickable.prototype,
  IP5TextInput.prototype,
);

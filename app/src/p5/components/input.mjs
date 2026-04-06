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
 * - text editing state:
 *   - cursor
 *   - selection
 *   - copy / cut / paste
 *   - word navigation
 *   - line/home/end navigation
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
 */
export default class BaseInteractiveInput extends IP5Lifecycle {
  /**
   * @param {{
   *   disabled?: boolean,
   *   blurOnOutsideClick?: boolean,
   *   focusOnClick?: boolean,
   *   permanentFocus?: boolean,
   *   submitOnEnter?: boolean,
   *   value?: string | null,
   *   placeholder?: string | null,
   *   enableClipboardShortcuts?: boolean,
   *   enableSelectionShortcuts?: boolean,
   *   enableWordNavigationShortcuts?: boolean,
   *   enableBoundaryNavigationShortcuts?: boolean,
   *   enableSelectAllShortcut?: boolean,
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

    this.enableClipboardShortcuts = options.enableClipboardShortcuts ?? true;
    this.enableSelectionShortcuts = options.enableSelectionShortcuts ?? true;
    this.enableWordNavigationShortcuts =
      options.enableWordNavigationShortcuts ?? true;
    this.enableBoundaryNavigationShortcuts =
      options.enableBoundaryNavigationShortcuts ?? true;
    this.enableSelectAllShortcut = options.enableSelectAllShortcut ?? true;

    this.placeholder = options.placeholder ?? null;
    this.value = options.value ?? null;

    /**
     * Caret index in current text
     * @type {number}
     */
    this.cursorIndex = this.text.length;

    /**
     * Selection anchor / focus.
     * When equal => no selection.
     * Selection range is [min(anchor, focus), max(anchor, focus))
     * @type {number}
     */
    this.selectionAnchor = this.cursorIndex;
    this.selectionFocus = this.cursorIndex;
  }

  /**
   * Current normalized text.
   * @returns {string}
   */
  get text() {
    return this.value ?? "";
  }

  /**
   * Replace current text while preserving the null-for-empty convention.
   * Also clamps caret/selection.
   *
   * @param {string | null | undefined} next
   */
  setText(next) {
    const normalized = next ?? "";
    this.value = normalized === "" ? null : normalized;
    this._clampEditingState();
  }

  /**
   * Whether the input currently has a non-empty selection.
   * @returns {boolean}
   */
  get hasSelection() {
    return this.selectionAnchor !== this.selectionFocus;
  }

  /**
   * Selection start index (inclusive)
   * @returns {number}
   */
  get selectionStart() {
    return Math.min(this.selectionAnchor, this.selectionFocus);
  }

  /**
   * Selection end index (exclusive)
   * @returns {number}
   */
  get selectionEnd() {
    return Math.max(this.selectionAnchor, this.selectionFocus);
  }

  /**
   * Resolve a caret index from a mouse position inside the component.
   *
   * Child classes should implement this using their own text layout logic.
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   * @returns {number | null | undefined}
   */
  getCursorIndexFromMouse(p5, event) {
    throw new TypeError(
      "Abstract method 'getCursorIndexFromMouse' must be implemented",
    );
  }

  /**
   * Move the caret to the index resolved by the child class.
   *
   * @param {import('p5')} p5
   * @param {MouseEvent} event
   * @param {boolean} extendSelection
   */
  placeCursorFromMouse(p5, event, extendSelection = false) {
    if (this.disabled) return;

    const nextIndex = this.getCursorIndexFromMouse(p5, event);

    if (nextIndex === null || nextIndex === undefined) return;

    this.moveCursorTo(nextIndex, extendSelection);
  }

  clear() {
    this.setText("");
    this.moveCursorToEnd(false);
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
    this.collapseSelectionToCursor();
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
   * Replace the current selection, or insert at caret if no selection.
   *
   * @param {string} text
   */
  replaceSelection(text) {
    const current = this.text;
    const start = this.selectionStart;
    const end = this.selectionEnd;
    const next = current.slice(0, start) + text + current.slice(end);

    this.setText(next);

    const nextCursor = start + text.length;
    this.cursorIndex = nextCursor;
    this.selectionAnchor = nextCursor;
    this.selectionFocus = nextCursor;
  }

  /**
   * Default text insertion behavior.
   *
   * @param {import('p5')} p5
   * @param {string} text
   * @param {KeyboardEvent} event
   */
  insertText(p5, text, event) {
    if (this.disabled || !this.focused) return;
    this.replaceSelection(text);
  }

  /**
   * Backspace selection or previous character.
   *
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  backspace(p5, event) {
    if (this.disabled || !this.focused) return;

    if (this.hasSelection) {
      this.replaceSelection("");
      return;
    }

    if (this.cursorIndex <= 0) return;

    const current = this.text;
    const originalCursorIndex = this.cursorIndex;

    const next =
      current.slice(0, originalCursorIndex - 1) +
      current.slice(originalCursorIndex);

    const nextCursor = originalCursorIndex - 1;

    this.setText(next);

    this.cursorIndex = nextCursor;
    this.selectionAnchor = nextCursor;
    this.selectionFocus = nextCursor;
  }
  /**
   * Delete selection or next character.
   *
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  deleteForward(p5, event) {
    if (this.disabled || !this.focused) return;

    if (this.hasSelection) {
      this.replaceSelection("");
      return;
    }

    const current = this.text;
    if (this.cursorIndex >= current.length) return;

    const next =
      current.slice(0, this.cursorIndex) + current.slice(this.cursorIndex + 1);

    this.setText(next);
    this.selectionAnchor = this.cursorIndex;
    this.selectionFocus = this.cursorIndex;
  }

  /**
   * Collapse selection to start or end.
   *
   * @param {"start" | "end"} edge
   */
  collapseSelection(edge = "end") {
    if (!this.hasSelection) return;

    const nextCursor =
      edge === "start" ? this.selectionStart : this.selectionEnd;

    this.cursorIndex = nextCursor;
    this.selectionAnchor = nextCursor;
    this.selectionFocus = nextCursor;
  }

  collapseSelectionToCursor() {
    this.selectionAnchor = this.cursorIndex;
    this.selectionFocus = this.cursorIndex;
  }

  selectAll() {
    const len = this.text.length;
    this.cursorIndex = len;
    this.selectionAnchor = 0;
    this.selectionFocus = len;
  }

  /**
   * @returns {string}
   */
  getSelectedText() {
    if (!this.hasSelection) return "";
    return this.text.slice(this.selectionStart, this.selectionEnd);
  }

  /**
   * Move caret to exact index.
   *
   * @param {number} index
   * @param {boolean} extendSelection
   */
  moveCursorTo(index, extendSelection = false) {
    const clamped = this._clampIndex(index);
    this.cursorIndex = clamped;

    if (extendSelection) {
      this.selectionFocus = clamped;
    } else {
      this.selectionAnchor = clamped;
      this.selectionFocus = clamped;
    }
  }

  /**
   * @param {boolean} extendSelection
   */
  moveCursorToStart(extendSelection = false) {
    this.moveCursorTo(0, extendSelection);
  }

  /**
   * @param {boolean} extendSelection
   */
  moveCursorToEnd(extendSelection = false) {
    this.moveCursorTo(this.text.length, extendSelection);
  }

  /**
   * @param {boolean} extendSelection
   */
  moveCursorLeft(extendSelection = false) {
    if (!extendSelection && this.hasSelection) {
      this.collapseSelection("start");
      return;
    }

    this.moveCursorTo(this.cursorIndex - 1, extendSelection);
  }

  /**
   * @param {boolean} extendSelection
   */
  moveCursorRight(extendSelection = false) {
    if (!extendSelection && this.hasSelection) {
      this.collapseSelection("end");
      return;
    }

    this.moveCursorTo(this.cursorIndex + 1, extendSelection);
  }

  /**
   * Move to previous word boundary.
   *
   * @param {boolean} extendSelection
   */
  moveCursorWordLeft(extendSelection = false) {
    const text = this.text;
    let i = this.cursorIndex;

    if (!extendSelection && this.hasSelection) {
      i = this.selectionStart;
    }

    if (i <= 0) {
      this.moveCursorTo(0, extendSelection);
      return;
    }

    // Skip whitespace to the left
    while (i > 0 && /\s/.test(text[i - 1])) i--;

    // Skip non-whitespace word chars to the left
    while (i > 0 && !/\s/.test(text[i - 1])) i--;

    this.moveCursorTo(i, extendSelection);
  }

  /**
   * Move to next word boundary.
   *
   * @param {boolean} extendSelection
   */
  moveCursorWordRight(extendSelection = false) {
    const text = this.text;
    const len = text.length;
    let i = this.cursorIndex;

    if (!extendSelection && this.hasSelection) {
      i = this.selectionEnd;
    }

    if (i >= len) {
      this.moveCursorTo(len, extendSelection);
      return;
    }

    // Skip whitespace to the right
    while (i < len && /\s/.test(text[i])) i++;

    // Skip current word to the right
    while (i < len && !/\s/.test(text[i])) i++;

    this.moveCursorTo(i, extendSelection);
  }

  /**
   * @param {boolean} extendSelection
   */
  moveBoundaryStart(extendSelection = false) {
    this.moveCursorToStart(extendSelection);
  }

  /**
   * @param {boolean} extendSelection
   */
  moveBoundaryEnd(extendSelection = false) {
    this.moveCursorToEnd(extendSelection);
  }

  /**
   * Copy current selection to clipboard.
   */
  async copySelection() {
    if (!this.enableClipboardShortcuts) return;
    if (!this.hasSelection) return;
    if (!navigator?.clipboard?.writeText) return;

    await navigator.clipboard.writeText(this.getSelectedText());
  }

  /**
   * Cut current selection to clipboard.
   */
  async cutSelection() {
    if (!this.enableClipboardShortcuts) return;
    if (!this.hasSelection) return;
    if (!navigator?.clipboard?.writeText) return;

    await navigator.clipboard.writeText(this.getSelectedText());
    this.replaceSelection("");
  }

  /**
   * Paste clipboard contents at current selection / caret.
   */
  async pasteClipboard() {
    if (!this.enableClipboardShortcuts) return;
    if (!navigator?.clipboard?.readText) return;

    const text = await navigator.clipboard.readText();
    if (typeof text !== "string" || text.length === 0) return;

    this.replaceSelection(text);
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

      this.placeCursorFromMouse(p5, event, event.shiftKey);
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
  async keyPressed(p5, event) {
    if (this.disabled || !this.focused) return;

    const key = event.key;
    const isPrimaryModifier = event.metaKey || event.ctrlKey;
    const isShift = event.shiftKey;
    const isAlt = event.altKey;

    // Browser/default prevention: when focused, this widget owns handled keys.
    const handledKeys = new Set([
      "'",
      "/",
      "Backspace",
      "Delete",
      "Enter",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ]);

    if (handledKeys.has(key) || key.length === 1 || isPrimaryModifier) {
      event.preventDefault();
    }

    // Cmd/Ctrl + A
    if (
      this.enableSelectAllShortcut &&
      isPrimaryModifier &&
      !isAlt &&
      key.toLowerCase() === "a"
    ) {
      this.selectAll();
      return;
    }

    // Cmd/Ctrl + C
    if (
      this.enableClipboardShortcuts &&
      isPrimaryModifier &&
      !isAlt &&
      key.toLowerCase() === "c"
    ) {
      await this.copySelection();
      return;
    }

    // Cmd/Ctrl + X
    if (
      this.enableClipboardShortcuts &&
      isPrimaryModifier &&
      !isAlt &&
      key.toLowerCase() === "x"
    ) {
      await this.cutSelection();
      return;
    }

    // Cmd/Ctrl + V
    if (
      this.enableClipboardShortcuts &&
      isPrimaryModifier &&
      !isAlt &&
      key.toLowerCase() === "v"
    ) {
      await this.pasteClipboard();
      return;
    }

    // Start / End
    if (this.enableBoundaryNavigationShortcuts && key === "Home") {
      this.moveBoundaryStart(isShift);
      return;
    }

    if (this.enableBoundaryNavigationShortcuts && key === "End") {
      this.moveBoundaryEnd(isShift);
      return;
    }

    // Cmd/Ctrl + Arrow => start/end
    if (
      this.enableBoundaryNavigationShortcuts &&
      isPrimaryModifier &&
      key === "ArrowLeft"
    ) {
      this.moveBoundaryStart(isShift);
      return;
    }

    if (
      this.enableBoundaryNavigationShortcuts &&
      isPrimaryModifier &&
      key === "ArrowRight"
    ) {
      this.moveBoundaryEnd(isShift);
      return;
    }

    // Option/Alt + Arrow => previous/next word
    if (
      this.enableWordNavigationShortcuts &&
      isAlt &&
      !isPrimaryModifier &&
      key === "ArrowLeft"
    ) {
      this.moveCursorWordLeft(isShift);
      return;
    }

    if (
      this.enableWordNavigationShortcuts &&
      isAlt &&
      !isPrimaryModifier &&
      key === "ArrowRight"
    ) {
      this.moveCursorWordRight(isShift);
      return;
    }

    // Regular arrow movement / shift-selection
    if (this.enableSelectionShortcuts && key === "ArrowLeft") {
      this.moveCursorLeft(isShift);
      return;
    }

    if (this.enableSelectionShortcuts && key === "ArrowRight") {
      this.moveCursorRight(isShift);
      return;
    }

    if (key === "Backspace") {
      this.backspace(p5, event);
      return;
    }

    if (key === "Delete") {
      this.deleteForward(p5, event);
      return;
    }

    if (key === "Enter") {
      if (this.submitOnEnter) {
        this.onSubmit(p5, event);
      }
      return;
    }

    // Ignore other primary-modifier combos
    if (isPrimaryModifier) {
      return;
    }

    if (key.length === 1) {
      this.insertText(p5, key, event);
    }
  }

  /**
   * @param {import('p5')} p5
   * @param {KeyboardEvent} event
   */
  keyReleased(p5, event) {
    if (this.disabled || !this.focused) return;
  }

  /**
   * Clamp cursor/selection to valid bounds.
   */
  _clampEditingState() {
    const len = this.text.length;
    this.cursorIndex = this._clampIndex(this.cursorIndex, len);
    this.selectionAnchor = this._clampIndex(this.selectionAnchor, len);
    this.selectionFocus = this._clampIndex(this.selectionFocus, len);
  }

  /**
   * @param {number} index
   * @param {number} [len]
   * @returns {number}
   */
  _clampIndex(index, len = this.text.length) {
    return Math.max(0, Math.min(index, len));
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

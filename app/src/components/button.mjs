import { IP5Lifecycle } from "src/p5/interfaces.mjs";

export default class Button extends IP5Lifecycle {
  /**
   * @param {{
   *   x: number,
   *   y: number,
   *   w: number,
   *   h: number,
   *   label: string,
   *   onClick?: ((p5: import("p5"), event: MouseEvent | null) => void) | null,
   *   styles?: {
   *     bgColor?: string | number | Array<number>,
   *     hoverBgColor?: string | number | Array<number>,
   *     pressedBgColor?: string | number | Array<number>,
   *     borderColor?: string | number | Array<number>,
   *     textColor?: string | number | Array<number>,
   *     disabledBgColor?: string | number | Array<number>,
   *     disabledTextColor?: string | number | Array<number>,
   *     borderWidth?: number,
   *     radius?: number,
   *     textSize?: number,
   *     textFont?: any,
   *     paddingX?: number,
   *   },
   *   disabled?: boolean,
   * }} options
   */
  constructor(options) {
    super();

    this.x = options.x;
    this.y = options.y;
    this.w = options.w;
    this.h = options.h;
    this.label = options.label;
    this.onClickCallback = options.onClick ?? null;

    this.disabled = options.disabled ?? false;
    this.hovered = false;
    this.pressed = false;

    this.styles = {
      bgColor: options.styles?.bgColor ?? [24, 24, 28],
      hoverBgColor: options.styles?.hoverBgColor ?? [42, 42, 50],
      pressedBgColor: options.styles?.pressedBgColor ?? [70, 70, 82],
      borderColor: options.styles?.borderColor ?? [255, 255, 255, 40],
      textColor: options.styles?.textColor ?? [245, 245, 245],
      disabledBgColor: options.styles?.disabledBgColor ?? [40, 40, 40],
      disabledTextColor: options.styles?.disabledTextColor ?? [140, 140, 140],
      borderWidth: options.styles?.borderWidth ?? 1,
      radius: options.styles?.radius ?? 10,
      textSize: options.styles?.textSize ?? 24,
      textFont: options.styles?.textFont ?? null,
      paddingX: options.styles?.paddingX ?? 16,
    };
  }

  setup(p5) {}

  /**
   * @param {import("p5")} p5
   */
  draw(p5) {
    p5.push();
    {
      const bg = this.disabled
        ? this.styles.disabledBgColor
        : this.pressed
          ? this.styles.pressedBgColor
          : this.hovered
            ? this.styles.hoverBgColor
            : this.styles.bgColor;

      const fg = this.disabled
        ? this.styles.disabledTextColor
        : this.styles.textColor;

      p5.stroke(this.styles.borderColor);
      p5.strokeWeight(this.styles.borderWidth);
      p5.fill(bg);
      p5.rect(this.x, this.y, this.w, this.h, this.styles.radius);

      p5.noStroke();
      p5.fill(fg);
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(this.styles.textSize);

      if (this.styles.textFont) {
        p5.textFont(this.styles.textFont);
      }

      p5.text(this.label, this.x + this.w / 2, this.y + this.h / 2);
    }
    p5.pop();
  }

  /**
   * @param {number} px
   * @param {number} py
   * @returns {boolean}
   */
  containsPoint(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.w &&
      py >= this.y &&
      py <= this.y + this.h
    );
  }

  /**
   * @param {import("p5")} p5
   * @returns {boolean}
   */
  isHovered(p5) {
    if (this.disabled) return false;
    return this.containsPoint(p5.mouseX, p5.mouseY);
  }

  /**
   * @param {import("p5")} p5
   * @param {MouseEvent} event
   */
  mouseMoved(p5, event) {
    if (this.disabled) {
      this.hovered = false;
      return;
    }
    this.hovered = this.isHovered(p5);
  }

  /**
   * @param {import("p5")} p5
   * @param {MouseEvent} event
   */
  mousePressed(p5, event) {
    if (this.disabled) return;
    this.pressed = this.containsPoint(p5.mouseX, p5.mouseY);
  }

  /**
   * @param {import("p5")} p5
   * @param {MouseEvent} event
   * @returns {boolean}
   */
  mouseReleased(p5, event) {
    if (this.disabled) {
      this.pressed = false;
      return false;
    }

    const wasPressed = this.pressed;
    const stillInside = this.containsPoint(p5.mouseX, p5.mouseY);
    this.pressed = false;

    return wasPressed && stillInside;
  }

  /**
   * @param {import("p5")} p5
   * @param {MouseEvent | null} event
   */
  click(p5, event = null) {
    if (this.disabled) return;
    this.onClickCallback?.(p5, event);
  }
}

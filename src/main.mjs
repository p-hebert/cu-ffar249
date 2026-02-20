/**
 * Create a p5 sketch in instance mode, and register the P5Runtime (SceneManager)
 * methods as handlers for the p5 lifecycle methods
 */
new window.p5(
  /**
   * @param {import('p5')} p5
   */
  function sketch(p5) {
    p5.setup = () => {
      p5.createCanvas(800, 800);
      p5.frameRate(60);
      p5.background("black");
    };
    p5.draw = () => {
      p5.background("black");
      p5.push();
      p5.fill("white");
      p5.text(p5.frameCount, p5.width / 2, p5.height / 2);
      p5.pop();
    };
    // p5.keyPressed = (event) => {}
    // p5.keyReleased = (event) => {}
    // p5.mouseClicked = (event) => {}
    // p5.mousePressed = (event) => {}
    // p5.mouseReleased = (event) => {}
  },
);

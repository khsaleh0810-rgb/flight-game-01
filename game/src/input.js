// Keyboard + mouse input. The plane answers to arrows/WASD for pitch and roll,
// Shift/Ctrl (or W/S) for throttle, and the mouse: hold the left button and
// drag to steer, which feels like a yoke. Every frame the game reads a single
// snapshot object, so the flight model never touches the DOM events directly.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { down: false, dx: 0, dy: 0 };
    this._dragX = 0;
    this._dragY = 0;
    this._pressed = new Set(); // edge-triggered keys, consumed once per frame

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) this._pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this._dragX = e.clientX;
      this._dragY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouse.down) return;
      this.mouse.dx += e.clientX - this._dragX;
      this.mouse.dy += e.clientY - this._dragY;
      this._dragX = e.clientX;
      this._dragY = e.clientY;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down.
  pressed(code) {
    return this._pressed.has(code);
  }

  // Snapshot for this frame: pitch -1..1 (up positive), roll -1..1 (right
  // positive), throttle delta, and the mouse drag since last frame.
  snapshot() {
    let pitch = 0;
    let roll = 0;
    if (this.down('ArrowUp') || this.down('KeyW')) pitch += 1;
    if (this.down('ArrowDown') || this.down('KeyS')) pitch -= 1;
    if (this.down('ArrowLeft') || this.down('KeyA')) roll -= 1;
    if (this.down('ArrowRight') || this.down('KeyD')) roll += 1;

    let throttle = 0;
    if (this.down('ShiftLeft') || this.down('ShiftRight')) throttle += 1;
    if (this.down('ControlLeft') || this.down('ControlRight')) throttle -= 1;
    // W/S double as throttle when the player holds them with no arrows;
    // arrows take priority for pitch, so W/S alone means throttle up/down.
    if (this.down('KeyW') && !this.down('ArrowUp') && !this.down('ArrowDown')) throttle += 1;
    if (this.down('KeyS') && !this.down('ArrowUp') && !this.down('ArrowDown')) throttle -= 1;

    const drag = { x: this.mouse.dx, y: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this._pressed.clear();
    return { pitch, roll, throttle, drag, mouseDown: this.mouse.down };
  }
}

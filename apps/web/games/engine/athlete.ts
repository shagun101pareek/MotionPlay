import Phaser from 'phaser';

/** Vector athlete. swing 0 is ready, 1 is the end of the stroke. */
export function drawAthlete(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale: number,
  color: number,
  swing: number,
  racketAngle: number,
  facing: 1 | -1,
): void {
  const s = Math.max(0.35, scale);
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(x, y + 2, 34 * s, 12 * s);

  g.lineStyle(Math.max(2, 4 * s), color, 1);
  g.beginPath();
  g.moveTo(x, y - 26 * s);
  g.lineTo(x - 8 * s, y);
  g.moveTo(x, y - 26 * s);
  g.lineTo(x + 8 * s, y);
  g.strokePath();

  g.lineStyle(Math.max(2, 5.5 * s), color, 1);
  g.beginPath();
  g.moveTo(x, y - 26 * s);
  g.lineTo(x + facing * 2 * s, y - 54 * s);
  g.strokePath();

  g.fillStyle(0xf0d0b4, 1);
  g.fillCircle(x + facing * 2 * s, y - 64 * s, 7.5 * s);

  const arm = (-1.05 + swing * 2.15) * facing;
  const shoulderX = x + facing * 2 * s;
  const shoulderY = y - 48 * s;
  const handX = shoulderX + Math.cos(arm) * 26 * s;
  const handY = shoulderY + Math.sin(arm) * 26 * s;
  g.lineStyle(Math.max(2, 3.5 * s), color, 1);
  g.beginPath();
  g.moveTo(shoulderX, shoulderY);
  g.lineTo(handX, handY);
  g.strokePath();

  const rot = arm + racketAngle * 0.55;
  const headX = handX + Math.cos(rot) * 14 * s;
  const headY = handY + Math.sin(rot) * 14 * s;
  g.lineStyle(Math.max(1.5, 2 * s), 0xf4f1ea, 1);
  g.strokeEllipse(headX, headY, 11 * s, 15 * s);
  g.fillStyle(0xf4f1ea, 0.18);
  g.fillEllipse(headX, headY, 11 * s, 15 * s);
  g.lineStyle(Math.max(1, 1.5 * s), 0x8d7bff, 0.9);
  g.beginPath();
  g.moveTo(handX, handY);
  g.lineTo(headX, headY);
  g.strokePath();
}

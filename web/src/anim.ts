// Shared animation timing (core): used by every system whose rate depends on frames drawn.
/** Animation frames per second for a nominal speed: a 10 ms timer adds speed/100 to a counter, each draw (fps) advances one
 *  frame if it is ≥ 1 and zeroes it (overflow lost). Tilling farmers and Mining miners both animate this way. */
export function framesPerSec(speed: number, fps = 60) {
  const draws = 600
  let acc = 0, frames = 0, ticks = 0
  for (let d = 1; d <= draws; d++) {
    const due = Math.floor(d * 100 / fps) // 10 ms ticks elapsed by this draw
    for (; ticks < due; ticks++) acc += speed / 100
    if (acc >= 1) { acc = 0; frames++ }
  }
  return frames / (draws / fps)
}

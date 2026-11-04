// Wall-clock time for all timers. In development, skip() fast-forwards every timer in the game together.
let offset = 0;

module.exports = {
  now: () => Date.now() + offset,
  skip(ms) {
    offset += ms;
  },
};

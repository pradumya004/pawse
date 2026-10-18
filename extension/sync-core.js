/**
 * @file sync-core.js
 * Clock sync and drift correction math, shared by the extension and the web
 * player. Pure functions, no DOM: unit-tested in test/sync-core.test.js.
 *
 * Loaded as a classic script (sets globalThis.PawseSync) so the extension's
 * content script and service worker can use it; the player imports it for
 * the same side effect, and Node tests require() it.
 */
(function (root) {
  const TUNING = {
    samples: 8, // clock samples kept; the lowest-RTT one wins
    deadband: 0.02, // s: closer than this counts as in sync
    seekAbove: 0.4, // s: further than this, jump instead of nudging
    maxNudge: 0.08, // max playbackRate change (+-8%)
    catchUpSecs: 2, // aim to close a gap over about this long
    staleAfter: 3000, // ms: ignore partner positions older than this
  };

  /**
   * One NTP-style round trip. Client sent at t0, server stamped ts, reply
   * arrived at t1 (client clock). Assumes the two legs take equal time.
   * @returns {{rtt:number, offset:number}} offset = serverClock - clientClock
   */
  function clockSample(t0, ts, t1) {
    const rtt = t1 - t0;
    return { rtt, offset: ts + rtt / 2 - t1 };
  }

  /** Keep the newest `max` samples. */
  function addSample(samples, sample, max = TUNING.samples) {
    const next = samples.concat(sample);
    return next.length > max ? next.slice(next.length - max) : next;
  }

  /**
   * Best offset estimate: the sample with the smallest RTT has the least room
   * for an asymmetric delay to bias it.
   * @returns {{rtt:number, offset:number}|null}
   */
  function bestSample(samples) {
    let best = null;
    for (const s of samples) if (!best || s.rtt < best.rtt) best = s;
    return best;
  }

  /**
   * Where a player should be at shared time `now`, given a position it
   * reported at shared time `at`.
   * @param {{mediaTime:number, at:number, paused?:boolean, rate?:number}} ref
   * @param {number} now - shared (relay) clock, ms
   */
  function expectedTime(ref, now) {
    if (ref.paused || typeof ref.at !== "number") return ref.mediaTime;
    const elapsed = Math.max(0, now - ref.at) / 1000;
    return ref.mediaTime + elapsed * (ref.rate || 1);
  }

  /**
   * Decide how to close the gap between our position and the expected one.
   * Positive error = we are ahead.
   * @returns {{kind:"ok", error:number, rate:1} |
   *           {kind:"nudge", error:number, rate:number} |
   *           {kind:"seek", error:number, to:number, rate:1}}
   */
  function correction(local, expected, t = TUNING) {
    const error = local - expected;
    const abs = Math.abs(error);
    if (abs <= t.deadband) return { kind: "ok", error, rate: 1 };
    if (abs > t.seekAbove) return { kind: "seek", error, to: expected, rate: 1 };
    const nudge = Math.min(t.maxNudge, abs / t.catchUpSecs);
    return { kind: "nudge", error, rate: 1 + (error > 0 ? -nudge : nudge) };
  }

  /**
   * What to do with a partner position report (ref, already in our local
   * clock) for our own video right now. null = not applicable: we are paused,
   * seeking, still loading, or the report is stale.
   */
  function plan(video, ref, now, t = TUNING) {
    if (!video || !ref || video.paused || video.seeking || video.readyState < 3) return null;
    if (ref.paused || now - ref.at > t.staleAfter) return null;
    return correction(video.currentTime, expectedTime(ref, now), t);
  }

  /**
   * Relay clock estimate from ping/pong samples. Messages carry relay-clock
   * timestamps on the wire; each side converts to and from its own clock.
   */
  function createClock(now = Date.now) {
    let samples = [];
    return {
      ping: () => ({ t0: now() }),
      pong(msg) {
        if (typeof msg.t0 === "number" && typeof msg.ts === "number")
          samples = addSample(samples, clockSample(msg.t0, msg.ts, now()));
      },
      get offset() {
        const b = bestSample(samples);
        return b ? b.offset : 0;
      },
      get rtt() {
        const b = bestSample(samples);
        return b ? b.rtt : null;
      },
      toRelay(ms) {
        return ms + this.offset;
      },
      toLocal(ms) {
        return ms - this.offset;
      },
    };
  }

  const api = {
    TUNING,
    clockSample,
    addSample,
    bestSample,
    expectedTime,
    correction,
    plan,
    createClock,
  };
  root.PawseSync = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);

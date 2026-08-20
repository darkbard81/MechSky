import { describe, expect, it } from "vitest";
import {
  discsOverlap,
  heightIntervalsOverlap,
  hitConnects,
  overlapElevation,
} from "../../src/sim/collision/hit-detection";
import { SpatialHash } from "../../src/sim/collision/spatial-hash";

describe("combat collision", () => {
  it("requires both the plane overlap and the height overlap", () => {
    const groundAttack = {
      x: 0,
      y: 0,
      radius: 60,
      minimumElevation: 0,
      maximumElevation: 90,
    };
    const grounded = {
      x: 80,
      y: 0,
      radius: 30,
      minimumElevation: 0,
      maximumElevation: 112,
    };
    const airborne = {
      ...grounded,
      minimumElevation: 140,
      maximumElevation: 252,
    };
    const farAway = { ...grounded, x: 400 };

    expect(hitConnects(groundAttack, grounded)).toBe(true);
    expect(discsOverlap(groundAttack, airborne)).toBe(true);
    expect(hitConnects(groundAttack, airborne)).toBe(false);
    expect(heightIntervalsOverlap(groundAttack, farAway)).toBe(true);
    expect(hitConnects(groundAttack, farAway)).toBe(false);
  });

  it("treats exact touching as a connect and one pixel further as a miss", () => {
    const attack = { x: 0, y: 0, radius: 60, minimumElevation: 0, maximumElevation: 90 };
    const touching = {
      x: 90,
      y: 0,
      radius: 30,
      minimumElevation: 0,
      maximumElevation: 112,
    };

    expect(hitConnects(attack, touching)).toBe(true);
    expect(hitConnects(attack, { ...touching, x: 90.001 })).toBe(false);
  });

  it("reports the shared height so impact effects sit inside both bodies", () => {
    expect(
      overlapElevation(
        { minimumElevation: 0, maximumElevation: 90 },
        { minimumElevation: 40, maximumElevation: 152 },
      ),
    ).toBe(65);
  });

  it("returns every candidate whose cells meet the query, without duplicates", () => {
    const hash = new SpatialHash(128);
    hash.insert({ id: 1, x: 0, y: 0, radius: 30 });
    hash.insert({ id: 2, x: 300, y: 0, radius: 30 });
    hash.insert({ id: 3, x: -260, y: -260, radius: 30 });

    const near = hash.query(20, 10, 60);
    expect(near.map(({ id }) => id)).toEqual([1]);

    const wide = hash.query(0, 0, 400);
    expect([...wide.map(({ id }) => id)].sort()).toEqual([1, 2, 3]);
  });

  it("keeps negative coordinates in distinct cells", () => {
    const hash = new SpatialHash(64);
    hash.insert({ id: 7, x: -100, y: 100, radius: 5 });
    hash.insert({ id: 8, x: 100, y: -100, radius: 5 });

    expect(hash.query(-100, 100, 5).map(({ id }) => id)).toEqual([7]);
    expect(hash.query(100, -100, 5).map(({ id }) => id)).toEqual([8]);
  });

  it("clears between frames so stale hurtboxes cannot be hit", () => {
    const hash = new SpatialHash(128);
    hash.insert({ id: 1, x: 0, y: 0, radius: 30 });
    hash.clear();
    expect(hash.query(0, 0, 60)).toEqual([]);
  });

  it("rejects a non-positive cell size", () => {
    expect(() => new SpatialHash(0)).toThrow(/cell size/);
  });
});

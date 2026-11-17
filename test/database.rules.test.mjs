import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { get, push, ref, remove, set, update } from "firebase/database";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

// js/app.js writes reviews with push() under "refuge-" + the restroom id.
// The payload is exactly { name, rating, review }. rating is the <select>
// value, a string ("0.5" … "5" in half-star steps), not a number. The form
// slices name to 80 characters and review to 1000, and it refuses either
// when empty after trim. There is no timestamp and no restroom id field.

const RATINGS = ["0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
const RESTROOM = "refuge-42";
const EXISTING = `${RESTROOM}/-Nexistingreview00001`;

const validReview = {
  name: "Ada",
  rating: "4.5",
  review: "Clean, open, and easy to find.",
};

let testEnv;
let anon;

function database() {
  return anon.database();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-where2p",
    database: {
      rules: readFileSync(new URL("../database.rules.json", import.meta.url), "utf8"),
    },
  });
  anon = testEnv.unauthenticatedContext();
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
});

async function seedExistingReview() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), EXISTING), validReview);
  });
}

describe("Realtime Database review rules", () => {
  it("allows a public read of the refuge path the app loads", async () => {
    await seedExistingReview();
    const snapshot = await assertSucceeds(get(ref(database(), RESTROOM)));
    assert.deepEqual(snapshot.child("-Nexistingreview00001").val(), validReview);
    await assertSucceeds(get(ref(database(), "refuge-100")));
  });

  it("rejects reads of the root and of paths the app does not use", async () => {
    await seedExistingReview();
    await assertFails(get(ref(database(), "/")));
    await assertFails(get(ref(database(), "reviews")));
    await assertFails(get(ref(database(), "refuge-")));
  });

  it("allows creating a new review with the fields the app writes", async () => {
    for (const rating of RATINGS) {
      const review = { name: "Ada", rating, review: "Worth the stop." };
      const created = push(ref(database(), RESTROOM));
      await assertSucceeds(set(created, review));
    }

    const atMax = {
      name: "n".repeat(80),
      rating: "5",
      review: "r".repeat(1000),
    };
    await assertSucceeds(set(push(ref(database(), "refuge-12_3")), atMax));
    await assertSucceeds(set(push(ref(database(), RESTROOM)), {
      name: "Ada Lovelace",
      rating: "5",
      review: "First line.\nSecond line.",
    }));
  });

  it("rejects overwriting an existing review", async () => {
    await seedExistingReview();
    const replacement = { ...validReview, review: "Replaced." };
    await assertFails(set(ref(database(), EXISTING), replacement));
    await assertFails(update(ref(database(), EXISTING), { review: "Replaced." }));
    await assertFails(set(ref(database(), RESTROOM), { "-Nbrandnewreview000001": validReview }));
  });

  it("rejects deleting an existing review", async () => {
    await seedExistingReview();
    await assertFails(remove(ref(database(), EXISTING)));
    await assertFails(update(ref(database(), RESTROOM), { "-Nexistingreview00001": null }));
    await assertFails(remove(ref(database(), RESTROOM)));
  });

  it("rejects a new review with an extra field", async () => {
    await assertFails(set(push(ref(database(), RESTROOM)), {
      ...validReview,
      timestamp: Date.now(),
    }));
    await assertFails(set(push(ref(database(), RESTROOM)), {
      ...validReview,
      restroomId: "42",
    }));
  });

  it("rejects values the form does not write", async () => {
    const created = () => push(ref(database(), RESTROOM));
    await assertFails(set(created(), { ...validReview, rating: 5 }));
    await assertFails(set(created(), { ...validReview, rating: "6" }));
    await assertFails(set(created(), { ...validReview, rating: "1.0" }));
    await assertFails(set(created(), { ...validReview, name: "" }));
    await assertFails(set(created(), { ...validReview, name: "   " }));
    await assertFails(set(created(), { ...validReview, name: "n".repeat(81) }));
    await assertFails(set(created(), { ...validReview, review: "" }));
    await assertFails(set(created(), { ...validReview, review: "r".repeat(1001) }));
    await assertFails(set(created(), { name: "Ada", rating: "5" }));
    await assertFails(set(push(ref(database(), "other-42")), validReview));
  });
});

/**
 * Юнит-тесты для конфигурации платёжной системы (src/lib/payment/config.ts)
 */

import { describe, it, expect } from "vitest";
import { LAVA_CONFIG, BOT_TRIAL_DAYS } from "@/lib/payment/config";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("LAVA_CONFIG — конфигурация офферов", () => {
  it("все offerId являются валидными UUID", () => {
    const offerIds = [
      LAVA_CONFIG.offers.oneTime.offerId,
      LAVA_CONFIG.offers.subscription.offerId,
      LAVA_CONFIG.offers.subscriptionPlus.offerId,
    ];

    for (const offerId of offerIds) {
      expect(offerId).toMatch(UUID_REGEX);
    }
  });

  it("freeTrialUses больше нуля", () => {
    expect(LAVA_CONFIG.freeTrialUses).toBeGreaterThan(0);
  });
});

describe("BOT_TRIAL_DAYS", () => {
  it("BOT_TRIAL_DAYS больше нуля", () => {
    expect(BOT_TRIAL_DAYS).toBeGreaterThan(0);
  });
});

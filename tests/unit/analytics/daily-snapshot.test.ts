import { describe, it, expect } from "vitest";
import { aggregateDay, type DayRows, type PaymentRow } from "@/lib/analytics/daily-snapshot";

const DAY = "2026-09-18";
const NOW = new Date("2026-09-19T00:30:00.000Z");

function payment(p: Partial<PaymentRow>): PaymentRow {
  return {
    user_id: "u1",
    offer_type: "one_time",
    amount: "399",
    status: "completed",
    created_at: `${DAY}T10:00:00.000Z`,
    completed_at: `${DAY}T11:00:00.000Z`,
    unlock_job_id: null,
    ...p,
  };
}

function rows(over: Partial<DayRows> = {}): DayRows {
  return {
    users: [],
    jobs: [],
    downloads: [],
    page_views: 0,
    payments_initiated: [],
    payments_completed: [],
    feedback: [],
    cumulative: { users: 0, payments_completed: 0, revenue_rub: 0 },
    ...over,
  };
}

describe("aggregateDay", () => {
  it("помечает таблицы с истёкшим TTL как partial и обнуляет их поля", () => {
    const snapshot = aggregateDay(DAY, rows({ page_views: 100 }), {
      now: new Date("2026-11-01T00:00:00.000Z"),
    });

    expect(snapshot.partial).toEqual(["jobs", "page_views"]);
    expect(snapshot.jobs).toBeNull();
    expect(snapshot.page_views).toBeNull();
    expect(snapshot.downloads).not.toBeNull();
  });

  it("свежий день не partial", () => {
    const snapshot = aggregateDay(DAY, rows({ page_views: 340 }), { now: NOW });
    expect(snapshot.partial).toEqual([]);
    expect(snapshot.page_views).toBe(340);
  });

  it("делит платежи на hook и direct", () => {
    const initiated = [
      payment({ unlock_job_id: "j1", status: "pending" }),
      payment({ unlock_job_id: "j2" }),
      payment({}),
      payment({ status: "failed" }),
    ];
    const completed = [payment({ unlock_job_id: "j2" }), payment({})];
    const snapshot = aggregateDay(DAY, rows({ payments_initiated: initiated, payments_completed: completed }), {
      now: NOW,
    });

    expect(snapshot.payments.initiated).toBe(4);
    expect(snapshot.payments.failed).toBe(1);
    expect(snapshot.payments.hook).toEqual({ attempts: 2, completed: 1 });
    expect(snapshot.payments.direct).toEqual({ attempts: 2, completed: 1 });
  });

  it("округляет выручку до копеек и разносит по офферам", () => {
    const completed = [
      payment({ amount: "399.333" }),
      payment({ amount: 199.334, offer_type: "subscription" }),
    ];
    const snapshot = aggregateDay(DAY, rows({ payments_completed: completed }), { now: NOW });

    expect(snapshot.payments.revenue_rub).toBe(598.67);
    expect(snapshot.payments.by_offer_type).toEqual({
      one_time: { n: 1, rub: 399.33 },
      subscription: { n: 1, rub: 199.33 },
    });
  });

  it("считает медиану времени от регистрации до оплаты", () => {
    const users = [
      { id: "u1", created_at: `${DAY}T00:00:00.000Z` },
      { id: "u2", created_at: `${DAY}T00:00:00.000Z` },
      { id: "u3", created_at: `${DAY}T00:00:00.000Z` },
    ];
    const odd = [
      payment({ user_id: "u1", completed_at: `${DAY}T01:00:00.000Z` }),
      payment({ user_id: "u2", completed_at: `${DAY}T10:00:00.000Z` }),
      payment({ user_id: "u3", completed_at: `${DAY}T05:00:00.000Z` }),
    ];
    expect(
      aggregateDay(DAY, rows({ users, payments_completed: odd }), { now: NOW }).payments
        .median_hours_reg_to_pay
    ).toBe(5);

    const even = odd.slice(0, 2);
    expect(
      aggregateDay(DAY, rows({ users, payments_completed: even }), { now: NOW }).payments
        .median_hours_reg_to_pay
    ).toBe(5.5);

    expect(aggregateDay(DAY, rows(), { now: NOW }).payments.median_hours_reg_to_pay).toBeNull();
  });

  it("берёт hostname из referrer и сортирует по убыванию", () => {
    const job = (referrer: string | null) => ({
      user_id: null,
      status: "completed",
      work_type: null,
      requirements_mode: null,
      has_full_version: false,
      referrer,
    });
    const snapshot = aggregateDay(
      DAY,
      rows({
        jobs: [
          job("https://yandex.ru/search?q=1"),
          job("https://yandex.ru/search?q=2"),
          job("https://vk.com/feed"),
          job("не ссылка"),
          job(null),
          job(""),
        ],
      }),
      { now: NOW }
    );

    expect(snapshot.jobs?.top_referrers).toEqual([
      { host: "yandex.ru", n: 2 },
      { host: "vk.com", n: 1 },
    ]);
  });

  it("считает регистрации за сутки, CSAT и прокидывает cumulative", () => {
    const snapshot = aggregateDay(
      DAY,
      rows({
        users: [
          { id: "u1", created_at: `${DAY}T00:00:00.000Z` },
          { id: "u2", created_at: `${DAY}T23:59:59.000Z` },
          { id: "u3", created_at: "2026-09-19T00:00:00.000Z" },
          { id: "u4", created_at: "2026-09-17T23:59:59.000Z" },
        ],
        feedback: [
          { rating: 5, source: "result" },
          { rating: 4, source: "result" },
          { rating: 3, source: "email" },
        ],
        cumulative: { users: 1450, payments_completed: 210, revenue_rub: 83790 },
      }),
      { now: NOW }
    );

    expect(snapshot.registrations).toBe(2);
    expect(snapshot.csat.avg).toBe(4);
    expect(snapshot.csat.distribution).toEqual({ "1": 0, "2": 0, "3": 1, "4": 1, "5": 1 });
    expect(snapshot.csat.by_source).toEqual({ result: 2, email: 1 });
    expect(snapshot.cumulative).toEqual({ users: 1450, payments_completed: 210, revenue_rub: 83790 });
  });
});

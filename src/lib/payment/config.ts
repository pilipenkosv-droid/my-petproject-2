/**
 * Конфигурация Lava.top
 */

export const LAVA_CONFIG = {
  baseUrl: "https://gate.lava.top",
  apiKey: process.env.LAVA_API_KEY!,

  offers: {
    oneTime: {
      offerId: "c665ecdf-922b-4081-910a-73a5287cd35c",
      price: 159,
      currency: "RUB" as const,
      periodicity: "ONE_TIME" as const,
      uses: 1, // 1 обработка документа
    },
    subscription: {
      offerId: "aec172e9-4f55-46b6-827f-6853fd810730",
      price: 399,
      currency: "RUB" as const,
      periodicity: "MONTHLY" as const,
      uses: 10, // 10 обработок в месяц
    },
  },

  // Кол-во бесплатных обработок для нового пользователя
  freeTrialUses: 1,
} as const;

export type OfferType = "one_time" | "subscription";
export type PaymentStatus = "pending" | "completed" | "failed";

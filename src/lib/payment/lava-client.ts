/**
 * Клиент Lava.top API
 */

import { LAVA_CONFIG } from "./config";

interface CreateInvoiceParams {
  email: string;
  offerId: string;
  currency?: string;
  periodicity: string;
  buyerLanguage?: string;
}

interface InvoiceResponse {
  id: string;
  status: string;
  paymentUrl: string | null;
  amountTotal?: {
    amount: number;
    currency: string;
  };
}

export async function createInvoice(
  params: CreateInvoiceParams
): Promise<InvoiceResponse> {
  const res = await fetch(`${LAVA_CONFIG.baseUrl}/api/v3/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": LAVA_CONFIG.apiKey,
    },
    body: JSON.stringify({
      email: params.email,
      offerId: params.offerId,
      currency: params.currency || "RUB",
      periodicity: params.periodicity,
      buyerLanguage: params.buyerLanguage || "RU",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Lava.top API error ${res.status}: ${error}`);
  }

  return res.json();
}

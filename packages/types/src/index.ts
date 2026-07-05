// Shared, transport-level TypeScript types used by api / web / admin.
// Domain models are inferred from Prisma in @mhgs/database; these describe
// the API contract (request/response shapes) shared across apps.

export type ProductType = 'topup' | 'voucher' | 'ingame' | 'subscription' | 'autolike';

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'autoprocessing'
  | 'completed'
  | 'cancelled'
  | 'hold';

export type StockStatus = 'available' | 'sold';
export type TrxType = 'credit' | 'debit';
export type Role = 'user' | 'admin' | 'reseller';
export type PaymentMethod = 'wallet' | 'uddoktapay';

/** Uniform API envelope returned by every endpoint. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  balance: string;
  role: Role;
}

export interface CreateOrderPayload {
  variation_id: string; // numeric id or "combo-{id}"
  payment_method: PaymentMethod;
  account_info: { player_id: string; [key: string]: string };
  quantity?: number;
  idempotency_key: string;
}

export interface CreateOrderResult {
  order_id: number;
  redirect_url?: string;
}

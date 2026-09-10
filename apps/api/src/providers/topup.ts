import { gs } from '../utils/settings';
import { logger } from '../utils/logger';
import * as topupnet from './topupnet.provider';
import * as pinbot from './pinbot.provider';

/**
 * Picks the auto-topup gateway at call time from the `topup_gateway` setting:
 *
 *   topup_gateway = 'topupnet'  (default — unchanged behaviour)
 *                 | 'pinbot'
 *                 | 'ucbot'     (synchronous — handled in order.service, NOT here)
 *
 * Everything else in the app imports from here, so switching gateways is a
 * settings change, not a code change.
 *
 * NB: ucbot is synchronous (no webhook) and does not fit the async
 * placeOrder/placeOrderViaShell/placeComboVoucherOrder surface below, so it is
 * deliberately NOT an impl() branch. order.service checks `activeGateway()` and
 * routes ucbot orders to its own inline complete/refund path.
 */

/** The configured gateway name, normalised. Falls back to 'topupnet'. */
export async function activeGateway(): Promise<string> {
  try {
    const s = await gs();
    return (s.str('topup_gateway') || 'topupnet').trim().toLowerCase();
  } catch (e) {
    logger.error(`⚠️ topup_gateway lookup failed, using topupnet: ${(e as Error).message}`);
    return 'topupnet';
  }
}

async function impl() {
  try {
    const s = await gs();
    const gateway = (s.str('topup_gateway') || 'topupnet').trim().toLowerCase();
    if (gateway === 'pinbot') return pinbot;
  } catch (e) {
    logger.error(`⚠️ topup_gateway lookup failed, using topupnet: ${(e as Error).message}`);
  }
  return topupnet;
}

export async function placeOrder(order: any, autoVoucher: { id: number; code: string } | null) {
  return (await impl()).placeOrder(order, autoVoucher);
}

export async function placeOrderViaShell(order: any) {
  return (await impl()).placeOrderViaShell(order);
}

export async function placeComboVoucherOrder(order: any, code: string, itemIndex: number) {
  return (await impl()).placeComboVoucherOrder(order, code, itemIndex);
}

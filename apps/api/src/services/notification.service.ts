import { gs } from '../utils/settings';
import { logger } from '../utils/logger';

/**
 * Telegram notifications — mirrors Laravel NotificationService.
 * Bot token / chat id come from settings (gs()), falling back to env.
 */

async function config() {
  const s = await gs();
  return {
    botToken: s.str('telegram_bot_token') || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: s.str('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID || '',
  };
}

export async function sendTelegram(message: string): Promise<boolean> {
  try {
    const { botToken, chatId } = await config();
    if (!botToken || !chatId) return false;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
    return true;
  } catch (e) {
    logger.error(`Telegram error: ${(e as Error).message}`);
    return false;
  }
}

/** New order notification. Package = variation.title ?? comboPackage.title. */
export async function newOrder(order: any): Promise<void> {
  const pkg = order.variation?.title ?? order.comboPackage?.title ?? 'N/A';
  const playerId = order.accountInfo?.player_id ?? '-';
  const message =
    `🛒 <b>New Order</b>\n\n` +
    `Order ID: <code>${order.id}</code>\n` +
    `User: ${order.user?.name ?? '-'}\n` +
    `Package: ${pkg}\n` +
    `Player ID: ${playerId}\n` +
    `Amount: ৳${order.amount}\n` +
    `Status: ${order.status}`;
  await sendTelegram(message);
}

/** New deposit notification. */
export async function newDeposit(deposit: any): Promise<void> {
  const message =
    `💰 <b>New Deposit</b>\n\n` +
    `User: ${deposit.user?.name ?? '-'}\n` +
    `Amount: ৳${deposit.amount}\n` +
    `Method: ${deposit.paymentMethod}`;
  await sendTelegram(message);
}

/** Low shell balance alert (call from a scheduled balance check). */
export async function shellLowBalance(
  shellName: string,
  balance: string | number,
  threshold: string | number,
): Promise<void> {
  const message =
    `🔴 <b>Low Shell Balance</b>\n\n` +
    `Shell: ${shellName}\n` +
    `Balance: ${balance}\n` +
    `Threshold: ${threshold}\n\n` +
    `Please top up the shell to keep auto delivery running.`;
  await sendTelegram(message);
}

/** Combo per-item status update. */
export async function comboItemUpdate(
  orderId: number,
  itemIndex: number,
  status: string,
  content?: string | null,
): Promise<void> {
  const icon = status === 'success' ? '✅' : '❌';
  const message =
    `${icon} <b>Combo Item</b>\n\n` +
    `Order ID: <code>${orderId}</code>\n` +
    `Item #${itemIndex}: ${status}` +
    (content ? `\n${content}` : '');
  await sendTelegram(message);
}

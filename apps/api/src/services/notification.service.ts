import { prisma } from '../config/database';
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

// ---------------------------------------------------------------------------
// কাস্টমারের নিজের টেলিগ্রামে বার্তা (পুশ নোটিফিকেশন)
// ---------------------------------------------------------------------------

/** নির্দিষ্ট একটা চ্যাটে বার্তা। ব্যর্থ হলে false (ব্লক করা/ডিলিট করা অ্যাকাউন্ট)। */
export async function sendTelegramTo(chatId: string, message: string): Promise<boolean> {
  try {
    const { botToken } = await config();
    if (!botToken || !chatId) return false;
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** একজন ইউজারকে — তার টেলিগ্রাম লিঙ্ক করা থাকলে। */
export async function notifyUser(userId: number, message: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
  if (!u?.telegramId) return false;
  return sendTelegramTo(u.telegramId, message);
}

/**
 * সব লিঙ্ক করা ইউজারকে ঘোষণা।
 * টেলিগ্রাম সেকেন্ডে ~৩০টার বেশি নিতে চায় না, তাই ব্যাচে পাঠাই।
 * @returns কতজনকে গেল, কতজনের কাছে যায়নি
 */
export async function broadcast(message: string): Promise<{ sent: number; failed: number; total: number }> {
  const users = await prisma.user.findMany({
    where: { telegramId: { not: null }, status: 1 },
    select: { telegramId: true },
  });
  let sent = 0;
  let failed = 0;
  const BATCH = 25;
  for (let i = 0; i < users.length; i += BATCH) {
    const chunk = users.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map((u) => sendTelegramTo(u.telegramId!, message)));
    for (const okSend of results) (okSend ? sent++ : failed++);
    if (i + BATCH < users.length) await new Promise((r) => setTimeout(r, 1100));
  }
  logger.info(`📢 Broadcast: ${sent} sent, ${failed} failed (of ${users.length})`);
  return { sent, failed, total: users.length };
}

/** অর্ডারের ফল কাস্টমারকে জানাই (completed / cancelled)। */
export async function notifyOrderResult(orderId: number): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, userId: true, status: true, amount: true, voucherCode: true,
        deliveryMessage: true, accountInfo: true,
        variation: { select: { title: true } },
        product: { select: { title: true, type: true } },
      },
    });
    if (!order) return;
    if (order.status !== 'completed' && order.status !== 'cancelled') return;

    const pkg = order.variation?.title ?? order.product?.title ?? '';
    let msg: string;

    if (order.status === 'completed') {
      const codes = String(order.voucherCode ?? '')
        .split(',').map((c) => c.trim()).filter((c) => /^[A-Z]{4}-/i.test(c));
      msg =
        `✅ <b>অর্ডার #${order.id} সম্পন্ন!</b>\n\n` +
        `📦 ${pkg}\n💵 ৳${order.amount}` +
        (codes.length ? `\n\n🎫 <b>আপনার কোড:</b>\n${codes.map((c) => `<code>${c}</code>`).join('\n')}` : '') +
        (order.deliveryMessage ? `\n\n${order.deliveryMessage}` : '');
    } else {
      msg =
        `❌ <b>অর্ডার #${order.id} বাতিল</b>\n\n` +
        `📦 ${pkg}\n💵 ৳${order.amount} আপনার ব্যালান্সে ফেরত দেওয়া হয়েছে।`;
    }
    await notifyUser(order.userId, msg);
  } catch (e) {
    logger.error(`notifyOrderResult failed: ${(e as Error).message}`);
  }
}

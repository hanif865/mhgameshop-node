import { prisma } from '../config/database';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import { createPayment } from '../providers/uddoktapay.provider';
import { newDeposit } from './notification.service';
import { fireAddFundsForDeposit } from './facebook.service';

/**
 * Deposit flow — mirrors Laravel DepositService.
 * NOTE: to stay faithful to the legacy code, a completed deposit records a
 * `debit` transaction (Laravel used Status::DEBIT here).
 */

export async function initiateDeposit(
  userId: number,
  amount: number,
): Promise<{ deposit_id: number; redirect_url: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found.');

  const deposit = await prisma.deposit.create({
    data: { userId, amount: amount.toFixed(2), paymentMethod: 'uddoktapay', status: 'pending' },
  });

  const paymentUrl = await createPayment({
    full_name: user.name,
    email: user.email,
    amount: deposit.amount,
    metadata: { deposit_id: deposit.id, kind: 'deposit' },
    // UddoktaPay-licensed domain (Caddy proxies /uddoktapay* to the API).
    redirect_url: `${env.WEB_URL}/uddoktapay/callback`,
    cancel_url: `${env.WEB_URL}/user/add-funds?status=cancelled`,
    webhook_url: `${env.WEB_URL}/uddoktapay`,
  });

  return { deposit_id: deposit.id, redirect_url: paymentUrl };
}

export async function completeDeposit(
  depositId: number,
  paymentMethod: string,
  transactionId: string,
): Promise<void> {
  const deposit = await prisma.deposit.findUnique({
    where: { id: depositId },
    include: { user: true },
  });
  if (!deposit) throw new HttpError(404, 'Deposit not found.');
  if (deposit.status === 'paid') return; // already processed

  // Guard against a replayed transaction id.
  const dup = await prisma.transaction.findFirst({ where: { transactionId } });
  if (dup) return;

  await prisma.$transaction([
    prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: 'paid', paymentMethod, transactionId },
    }),
    prisma.user.update({
      where: { id: deposit.userId },
      data: { balance: { increment: deposit.amount } },
    }),
    prisma.transaction.create({
      data: {
        userId: deposit.userId,
        trxType: 'debit',
        amount: deposit.amount,
        paymentMethod,
        transactionId,
        remarks: `Deposit via ${paymentMethod}`,
      },
    }),
  ]);

  await newDeposit({ ...deposit, paymentMethod });

  // ওয়ালেটে ফান্ড যোগ → আলাদা কাস্টম ইভেন্ট `AddFunds` (Purchase নয়)। Model A-তে
  // ওয়ালেট-ফান্ডেড অর্ডারে Purchase আলাদা করে ফায়ার হয়, তাই ডিপোজিটকে Purchase
  // ধরলে ডাবল-কাউন্ট হত। fire-and-forget — ডিপোজিট-ফ্লো কখনো আটকাবে না।
  void fireAddFundsForDeposit(deposit).catch(() => {});
}

export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  // সবসময় রাউন্ড ফিগার — কোনো দশমিক দেখাবে না (নিকটতম পূর্ণসংখ্যায়)।
  return `৳${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

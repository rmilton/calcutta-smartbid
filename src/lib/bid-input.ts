export function formatBidInputValue(value: number) {
  return formatBidInputText(String(Math.max(0, value)));
}

export function formatBidInputText(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(Number(digits));
}

export function parseBidInputValue(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return 0;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

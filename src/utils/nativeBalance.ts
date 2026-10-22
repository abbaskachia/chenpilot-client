export const calculateSpendableNativeBalance = (
  nativeBalance: string,
  requiredReserve: string,
): number | null => {
  if (!nativeBalance.trim() || !requiredReserve.trim()) {
    return null;
  }

  const total = Number(nativeBalance);
  const reserve = Number(requiredReserve);

  if (!Number.isFinite(total) || !Number.isFinite(reserve) || total < 0 || reserve < 0) {
    return null;
  }

  return Math.max(0, total - reserve);
};

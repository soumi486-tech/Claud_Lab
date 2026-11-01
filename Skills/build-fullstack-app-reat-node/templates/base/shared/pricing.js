// Rules shared by the browser (for display) and the server (authoritative).
// TODO(domain): put prices, taxes, slot rules, cancellation windows here as pure functions.
export const round2 = (n) => Math.round(n * 100) / 100;

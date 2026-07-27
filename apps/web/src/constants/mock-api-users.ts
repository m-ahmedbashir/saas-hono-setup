////////////////////////////////////////////////////////////////////////////////
// 🛑 Not a fake database anymore — the Users feature now calls authClient.admin.*
// directly (see src/features/users). `delay` is kept because the overview
// dashboard's parallel-route pages (@area_stats, @bar_stats, @pie_stats, @sales)
// still use it to simulate loading latency for their own mock chart data.
////////////////////////////////////////////////////////////////////////////////

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

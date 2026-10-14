/**
 * 资金账本适配器。
 * 演示环境使用内存账本；接入真实钱包时实现同一接口并在 createGameService 中注入即可，
 * 游戏逻辑层完全不感知差异。
 *
 * interface WalletAdapter {
 *   getBalance(ctx): Promise<number>
 *   debit(ctx, amount): Promise<number>   // 返回扣款后余额
 *   credit(ctx, amount): Promise<number>  // 返回入账后余额
 * }
 */
export function createDemoWallet() {
  return {
    kind: 'demo',
    async getBalance(ctx) {
      return ctx.state.balance;
    },
    async debit(ctx, amount) {
      ctx.state.balance = Math.round((ctx.state.balance - amount) * 10000) / 10000;
      return ctx.state.balance;
    },
    async credit(ctx, amount) {
      ctx.state.balance = Math.round((ctx.state.balance + amount) * 10000) / 10000;
      return ctx.state.balance;
    }
  };
}

# 6. 交易生命週期與 Gas 市場

## 6.1 生命週期
1. 建構交易（nonce/gas/data/value）
2. 本地或服務端模擬
3. 簽名
4. 廣播到 mempool
5. 打包出塊
6. 達到確認與最終性

## 6.2 EVM Gas（EIP-1559）
- `baseFee`: 協議燃燒
- `priorityFee`: 給出塊者小費
- `maxFee`: 使用者可接受上限

## 6.3 交易失敗型態
- Out of gas
- Revert（require/assert/custom error）
- Nonce too low/high
- Slippage 保護觸發

## 6.4 MEV 與排序風險
- Front-running
- Sandwich attack
- Back-running

工程手段：
- 私有 RPC / Builder 直連
- 交易批次化
- 價格保護與 deadline

## 6.5 狀態機視角

```text
Draft -> Signed -> Pending -> Included -> Confirmed(k) -> Finalized
                    |             |
                    |             +-> Reverted
                    +-> Dropped/Replaced
```

## 6.6 UTXO 交易生命週期
1. coin selection（選哪些 UTXO 當 inputs）
2. 估算 fee rate（sat/vB 等）
3. 產生 outputs（收款 + change）
4. 本地簽名（含 witness）
5. 廣播與 mempool 排序
6. 必要時 RBF/CPFP 加速
7. 入塊後按確認數提升信任等級

## 白話說明
交易送出後不是「成功或失敗」兩種，而是一連串狀態轉換。你的系統要完整追蹤每個狀態。

# 8. L1/L2/跨鏈與橋接

## 8.1 為什麼需要 L2
- 降低交易成本
- 提高吞吐
- 把計算外包到 L2，把安全錨定在 L1

## 8.2 Rollup 差異
- Optimistic Rollup: 挑戰期 + fraud proof
- ZK Rollup: validity proof 快速最終性

## 8.3 跨鏈橋模型
- Lock & Mint
- Burn & Release
- Light-client bridge
- External validator bridge

## 8.4 跨鏈風險
- 驗證者集中
- 訊息重放
- 錯誤最終性假設
- 升級權限過大

## 8.5 訊息流

```text
Chain A Contract --emit--> Bridge Relayer --proof--> Chain B Verifier
       ^                                                    |
       |                                                    v
       +------------------- ack / failure ------------------+
```

## 8.6 防禦準則
- 大額跨鏈用分批與速率限制
- 橋接白名單與路由選擇策略
- 目的鏈最終性達標才入帳

## 白話說明
跨鏈就是在兩本不同總帳間對帳。驗證機制越弱，資產風險越高。

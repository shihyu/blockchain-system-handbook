# 9. DeFi 原語與組合性

## 9.1 基本原語
- AMM: x*y=k、集中流動性
- Lending: 抵押借貸、健康因子、清算
- Derivatives: 永續合約、資金費率
- Stablecoin: 抵押型、演算法型、法幣儲備型

## 9.2 系統風險
- 流動性枯竭
- Oracle 延遲或操縱
- 清算擁塞
- 參數治理失誤

## 9.3 交易路由層
- Aggregator 比價
- Multi-hop 路徑
- MEV 保護與最小輸出

## 9.4 組合性收益與風險
- 收益來自費率與槓桿
- 風險來自協議依賴鏈

```text
User -> Vault -> Strategy A (Lending)
              -> Strategy B (LP Farming)
              -> Strategy C (Basis Trade)
```

## 9.5 工程建議
- 對外協議設定風險分數
- 依分數配置資金上限
- 任一依賴異常時觸發策略降檔

## 白話說明
DeFi 很像可組合的金融積木。積木越多，收益可能更高，但連鎖故障機率也更高。

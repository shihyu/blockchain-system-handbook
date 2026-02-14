# 16. UTXO / EUTXO 全面深潛

## 16.1 UTXO 是什麼
UTXO（Unspent Transaction Output）是「尚未被花費的輸出」。
交易不是改餘額，而是「消耗舊輸出 + 產生新輸出」。

## 16.2 UTXO 交易結構

```text
Inputs (引用舊 UTXO) + Unlock Script/Witness
            |
            v
Validation (簽名、腳本條件、金額守恆)
            |
            v
Outputs (新 UTXO 集合)
   - recipient output
   - change output
   - fee = inputs - outputs
```

## 16.3 常見 UTXO 鏈全表
| 類別 | 鏈 | 共識/模型 | 重點 |
|---|---|---|---|
| PoW UTXO 主流 | Bitcoin | PoW + UTXO | 安全錨、最成熟 |
| PoW UTXO 支付 | Litecoin, Dogecoin, BCH, Dash | PoW + UTXO | 支付導向、費用較低 |
| 隱私 UTXO | Zcash, Monero | PoW + Shielded/RingCT | 隱私強、合規成本高 |
| 擴展 UTXO | Cardano(EUTXO), CKB(Cell) | PoS/PoW + UTXO 變體 | 合約能力提升 |
| 高吞吐 UTXO 路線 | Kaspa | PoW + DAG/UTXO | 追求低延遲高吞吐 |

## 16.4 EUTXO（Extended UTXO）
EUTXO 在每個輸出上加入：
- Datum（資料）
- Redeemer（花費參數）
- Validator Script（驗證邏輯）

這讓 UTXO 可承載更複雜狀態機，但開發難度會提高。

## 16.5 UTXO vs Account 的工程差異

### 狀態建模
- UTXO: 顯式輸入輸出，天然「來源 -> 去向」可追蹤
- Account: 隱式狀態更新，合約邏輯彈性大

### 並行度
- UTXO: 不同 UTXO 可平行驗證
- Account: 同帳戶 nonce 序列化，容易排隊

### 費用估算
- UTXO: 受輸入輸出數量與見證大小影響
- Account: 受 opcode 執行與 storage 變更影響

### 開發心智
- UTXO: TX graph 思維（像資料流）
- Account: 合約狀態機思維（像物件模型）

## 16.6 UTXO 常見工程問題
- Dust UTXO: 太小輸出造成管理成本高
- UTXO Fragmentation: 輸出過碎，手續費升高
- Coin Selection: 怎麼選輸入最省費用
- Change Management: 找零地址管理錯誤造成追蹤困難
- Fee Bumping: 交易卡住時要 RBF/CPFP

## 16.7 Coin Selection 策略
- Largest First: 省輸入數，可能找零過大
- Branch and Bound: 嘗試精準匹配
- Knapsack: 近似最佳化
- Privacy-aware: 避免地址關聯洩漏

## 16.8 交易加速策略
- RBF（Replace-By-Fee）: 同 nonce/輸入替換更高手續費
- CPFP（Child-Pays-For-Parent）: 子交易抬高父交易打包誘因

## 16.9 UTXO 金流稽核
- 每一筆輸入可回溯來源 UTXO
- 可建立 UTXO age / provenance 風險模型
- 建議建立地址分群與風險標記（內部可見）

## 16.10 UTXO 多簽
常見腳本路線：
- Bitcoin Script 多簽（historical）
- P2WSH / Taproot policy（現代實務）
- Threshold 方案（例如 MuSig2 類聚合簽名）

重點控制項：
- 門檻策略 M-of-N
- 輸出模板白名單
- 時鎖（絕對/相對）
- 緊急恢復路徑（social recovery）

## 16.11 UTXO 安全檢查清單
- [ ] 地址與腳本型別檢查（P2PKH/P2WPKH/P2TR 等）
- [ ] Coin selection 策略與隱私策略分離
- [ ] 交易模擬與費率估算多來源比對
- [ ] Change output 不落到錯誤地址池
- [ ] 大額轉帳使用多簽 + 時鎖
- [ ] 卡交易有 RBF/CPFP runbook

## 16.12 什麼場景適合 UTXO
- 高審計要求的資產結算
- 需簡潔可驗證的支付引擎
- 不追求複雜共享合約狀態

## 白話說明
UTXO 就像你皮夾裡一堆紙鈔：
- 付款時挑幾張出來
- 找零會再回你新紙鈔
- 每張紙鈔都有來源與流向
所以很適合做「可追蹤」的資產系統。

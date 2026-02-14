# 第5章 Go 語言區塊鏈高級應用開發

本章以「做出一條可跑的簡化區塊鏈」為目標，重點在資料結構與交易流程是否自洽。

## 5.1 Go 語言與區塊鏈開發準備

### 5.1.1 Go 語言與 hash 函數 `P0`

常用組件：
- `crypto/sha256`
- `encoding/hex`
- `bytes`

設計原則：
- 區塊、交易都要有穩定序列化
- hash 結果用 `[]byte` 儲存，顯示時才轉 hex

### 5.1.2 Go 語言與 Base58 編碼 `P0`

Base58 用於人類可讀地址，避免 `0/O/I/l` 混淆。

典型地址流程：
1. 公鑰 hash（`SHA256 + RIPEMD160`）
2. 加版本前綴
3. 加 checksum
4. Base58 編碼

### 5.1.3 Go 語言與默克爾樹 `P0`

Merkle Tree 用於交易集合摘要：
- 葉節點：交易 hash
- 父節點：`hash(left || right)`
- 根節點：區塊 header 的 `MerkleRoot`

常見坑：
- 奇數葉節點時複製最後一個葉節點
- 序列化不一致導致根 hash 不一致

### 5.1.4 Go 語言實現 P2P 網絡 `P0`

最小消息定義建議：
- `version`
- `getblocks`
- `inv`
- `getdata`
- `block`
- `tx`

工程建議：
- 每種消息用獨立 handler
- 建立 peer set 與去重 cache
- 記錄最後已知區塊高度

## 5.2 Go 語言實現 PoW 共識算法

### 5.2.1 區塊定義與數據串行化 `P0`

核心結構：

```go
type Block struct {
    Version    int64
    PrevHash   []byte
    MerkleRoot []byte
    Timestamp  int64
    Bits       int64
    Nonce      int64
    Hash       []byte
    Txs        []*Transaction
}
```

序列化建議：
- `encoding/gob`（教學簡單）或 `protobuf`（可演進）
- 解碼錯誤要立即失敗，不可靜默忽略

### 5.2.2 PoW 算法實現 `P0`

流程：
1. 準備區塊 header bytes
2. 從 nonce=0 迭代
3. 計算 hash，與 target 比較
4. 命中後寫入區塊 `Nonce` 與 `Hash`

```text
PrepareHeader -> Hash -> CompareTarget -> Success? -> next nonce
```

驗證函數：
- 每個節點收到區塊都必須重算驗證
- 不能信任對方提供的 `Hash` 欄位

## 5.3 區塊數據如何持久化

### 5.3.1 Go 語言與 boltDB 實戰 `P0`

BoltDB（bbolt）特性：
- 單機嵌入式 KV
- ACID 交易
- 讀多寫少場景適合教學鏈

建議 bucket：
- `blocks`：`hash -> block bytes`
- `meta`：`lastHash -> ...`
- `utxo`：`txid:vout -> output`

### 5.3.2 區塊數據如何持久化 `P0`

寫入流程：
1. 驗證區塊
2. 寫入 `blocks`
3. 更新 `lastHash`
4. 更新 UTXO 索引

### 5.3.3 區塊數據如何遍歷 `P0`

從 `lastHash` 反向走 `PrevHash` 到 genesis：

```text
last -> prev -> prev -> ... -> genesis
```

常見坑：
- 遍歷未處理空 hash 終止條件
- DB 交易未關閉造成資源泄漏

## 5.4 Go 語言實現 UTXO 模型

### 5.4.1 如何定義交易 `P0`

```go
type TXInput struct {
    Txid      []byte
    Vout      int
    Signature []byte
    PubKey    []byte
}

type TXOutput struct {
    Value      int
    PubKeyHash []byte
}

type Transaction struct {
    ID   []byte
    Vin  []TXInput
    Vout []TXOutput
}
```

### 5.4.2 如何判斷 CoinBase 交易 `P0`

規則：
- `len(Vin) == 1`
- `Vin[0].Txid == nil`
- `Vin[0].Vout == -1`

### 5.4.3 如何使用 CoinBase 交易 `P0`

CoinBase 用於區塊獎勵，通常每個區塊第一筆交易。

實作要點：
- 獎勵值可參數化
- 高度可寫入 `scriptSig` 或附加欄位

### 5.4.4 如何查找賬戶的 UTXO `P0`

流程：
1. 從 UTXO 集索引查 `PubKeyHash` 匹配輸出
2. 累加直到滿足轉帳金額
3. 回傳可用輸入與總額

常見坑：
- 沒標記已花費輸出，導致雙花
- 未處理變更輸出導致餘額錯誤

### 5.4.5 如何發送交易 `P0`

完整流程：
1. 選 UTXO（coin selection）
2. 建輸入輸出（含找零）
3. 對每個輸入簽名
4. 計算 txid
5. 廣播到交易池

```text
SelectUTXO -> BuildTx -> SignInputs -> Verify -> Broadcast
```

## 5.5 區塊鏈賬戶地址如何生成

### 5.5.1 公鑰加密與數字簽名 `P0`

常用曲線：`secp256k1`

簽名驗證核心：
- 私鑰簽
- 公鑰驗
- 交易內容變動則簽名失效

### 5.5.2 生成區塊鏈賬戶地址 `P0`

流程：
1. 生成私鑰
2. 推導公鑰
3. 公鑰 hash
4. 加版本與 checksum
5. Base58 編碼

安全要求：
- 私鑰不落盤明文
- 助記詞/私鑰分離備份

## 實訓：結合區塊鏈賬戶地址，發送區塊鏈交易 `P0`

目標：
- 建立兩個地址 A/B
- A 先獲得 coinbase
- A 向 B 轉帳並找零
- 打包出塊後驗證餘額

驗收：
- A/B 餘額符合預期
- 交易可驗簽
- UTXO 集狀態正確更新

## 本章總結

本章完成後，你已具備：
- 一條簡化鏈的核心資料結構
- PoW 出塊與驗證流程
- UTXO 交易與地址生成能力
- DB 持久化與遍歷能力

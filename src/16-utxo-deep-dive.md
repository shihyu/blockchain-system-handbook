# 16. UTXO / EUTXO 全面深潛

本章深入探討 UTXO（Unspent Transaction Output）模型的工程實務，包括交易結構、常見鏈的比較、EUTXO 擴展、與 Account 模型的工程差異、以及實際開發中常遇到的問題和解決方案。UTXO 模型是 Bitcoin 和許多區塊鏈的基礎，理解它的運作方式和工程限制，對於設計安全的資產管理系統至關重要。

---

## 16.1 UTXO 是什麼

UTXO（Unspent Transaction Output）是「尚未被花費的輸出」。
交易不是改餘額，而是「消耗舊輸出 + 產生新輸出」。

要理解 UTXO，最直覺的方式是把它想成實體現金。你的「餘額」不是銀行帳戶裡的一個數字，而是你皮夾裡所有紙鈔面額的加總。當你要付款時，你拿出幾張紙鈔，商家找零給你新的紙鈔。UTXO 就是這些「紙鈔」，每一張都有明確的面額和來源。

在 Account 模型（如 Ethereum）中，轉帳是修改兩個帳戶的餘額數字：A 的餘額減少、B 的餘額增加。但在 UTXO 模型中，沒有「帳戶餘額」這個概念。所謂的「餘額」是透過掃描整個 UTXO 集合，找出所有鎖定在你的地址上的 UTXO，將它們的金額加總得出的。

UTXO 模型的核心不變量是：**每筆交易的輸入金額總和必須大於或等於輸出金額總和，差額就是礦工手續費**。這個簡單的守恆定律是 Bitcoin 安全性的數學基礎之一。

```text
UTXO 的生命週期：

  Coinbase Tx         Normal Tx           Normal Tx
  (挖礦產生)          (花費 + 找零)        (被花費)
      │                   │                   │
      v                   v                   v
  ┌────────┐         ┌────────┐         ┌────────┐
  │ UTXO A │──花費──>│ UTXO B │──花費──>│ UTXO D │──花費──> ...
  │ 50 BTC │         │ 30 BTC │         │ 10 BTC │
  └────────┘         └────────┘         └────────┘
                     │ UTXO C │
                     │ 19.99  │ (找零)
                     └────────┘
                     fee=0.01 BTC
```

---

## 16.2 UTXO 交易結構

```text
┌─────────────────────────────────────────────────────────┐
│                    Transaction                           │
├─────────────────────────────────────────────────────────┤
│  Version: 2                                              │
│  Locktime: 0 (or specific block height/timestamp)       │
│                                                          │
│  Inputs (引用舊 UTXO):                                  │
│  ┌───────────────────────────────────────────────┐      │
│  │ Input 0:                                       │      │
│  │   prev_txid: 0xabcd...1234                     │      │
│  │   output_index: 0                              │      │
│  │   scriptSig/witness: <signature> <pubkey>      │      │
│  │   sequence: 0xfffffffe                         │      │
│  ├───────────────────────────────────────────────┤      │
│  │ Input 1:                                       │      │
│  │   prev_txid: 0xef01...5678                     │      │
│  │   output_index: 2                              │      │
│  │   scriptSig/witness: <signature> <pubkey>      │      │
│  │   sequence: 0xfffffffe                         │      │
│  └───────────────────────────────────────────────┘      │
│                                                          │
│  Validation:                                             │
│  ┌───────────────────────────────────────────────┐      │
│  │ 1. 簽名驗證 (scriptSig matches scriptPubKey)  │      │
│  │ 2. 腳本條件 (timelock, multisig, etc.)        │      │
│  │ 3. 金額守恆 (sum(inputs) >= sum(outputs))     │      │
│  │ 4. 雙花檢查 (UTXO 未被花費)                   │      │
│  └───────────────────────────────────────────────┘      │
│                                                          │
│  Outputs (新 UTXO 集合):                                │
│  ┌───────────────────────────────────────────────┐      │
│  │ Output 0 (recipient):                          │      │
│  │   value: 1.5 BTC                              │      │
│  │   scriptPubKey: OP_0 <20-byte-hash>           │      │
│  ├───────────────────────────────────────────────┤      │
│  │ Output 1 (change):                             │      │
│  │   value: 0.4999 BTC                           │      │
│  │   scriptPubKey: OP_0 <20-byte-hash>           │      │
│  └───────────────────────────────────────────────┘      │
│                                                          │
│  fee = sum(inputs) - sum(outputs) = 0.0001 BTC          │
└─────────────────────────────────────────────────────────┘
```

### 交易結構詳解

每筆 UTXO 交易由四個核心部分組成：version（版本號）、inputs（輸入）、outputs（輸出）、locktime（鎖定時間）。

**Inputs** 引用之前交易產生的 UTXO，透過 `prev_txid`（前序交易 ID）和 `output_index`（輸出索引）來精確指向一個特定的 UTXO。每個 input 還包含一個 `scriptSig`（或 SegWit 的 witness 資料），用來「解鎖」被引用的 UTXO。解鎖的方式取決於 UTXO 的鎖定腳本：最簡單的是提供一個有效的數位簽名和對應的公鑰。

**Outputs** 定義新的 UTXO。每個 output 包含一個金額（`value`）和一個鎖定腳本（`scriptPubKey`），規定了什麼條件下這個 UTXO 可以被花費。常見的鎖定腳本類型包括 P2PKH（Pay to Public Key Hash）、P2WPKH（Pay to Witness Public Key Hash，SegWit）、P2TR（Pay to Taproot）。

**Fee** 不是一個顯式欄位，而是 inputs 總金額減去 outputs 總金額的差值。這個差值被視為礦工費，激勵礦工將交易打包入區塊。

### 交易驗證的 pseudocode

```python
def validate_transaction(tx, utxo_set):
    total_input = 0
    total_output = 0

    # 驗證每個 input
    for inp in tx.inputs:
        # 1. 查找被引用的 UTXO
        utxo = utxo_set.get(inp.prev_txid, inp.output_index)
        if utxo is None:
            return False  # UTXO 不存在或已被花費

        # 2. 驗證解鎖腳本
        if not verify_script(inp.scriptSig, utxo.scriptPubKey, tx):
            return False  # 簽名/腳本驗證失敗

        total_input += utxo.value

    # 驗證每個 output
    for out in tx.outputs:
        if out.value < 0:
            return False  # 金額不能為負
        if out.value < DUST_THRESHOLD:
            return False  # 低於 dust 門檻
        total_output += out.value

    # 3. 金額守恆
    if total_input < total_output:
        return False  # 輸出不能大於輸入

    fee = total_input - total_output
    if fee < MIN_RELAY_FEE:
        return False  # 手續費太低

    return True
```

---

## 16.3 常見 UTXO 鏈全表

| 類別 | 鏈 | 共識/模型 | 重點 |
|---|---|---|---|
| PoW UTXO 主流 | Bitcoin | PoW + UTXO | 安全錨、最成熟 |
| PoW UTXO 支付 | Litecoin, Dogecoin, BCH, Dash | PoW + UTXO | 支付導向、費用較低 |
| 隱私 UTXO | Zcash, Monero | PoW + Shielded/RingCT | 隱私強、合規成本高 |
| 擴展 UTXO | Cardano(EUTXO), CKB(Cell) | PoS/PoW + UTXO 變體 | 合約能力提升 |
| 高吞吐 UTXO 路線 | Kaspa | PoW + DAG/UTXO | 追求低延遲高吞吐 |

### 各類 UTXO 鏈的工程差異

**Bitcoin** 是 UTXO 模型的原型，也是最成熟的實現。其腳本語言（Bitcoin Script）是刻意設計為非圖靈完備的，限制了合約的複雜度但大幅降低了攻擊面。2021 年啟用的 Taproot 升級（BIP-340/341/342）帶來了 Schnorr 簽名和 MAST（Merkelized Abstract Syntax Trees），使得複雜的腳本條件可以更高效、更隱私地實現。Ordinals 和 BRC-20 則展示了在 UTXO 模型上構建更豐富應用的可能性，雖然這些做法在社群中存在爭議。

**隱私 UTXO 鏈** 在工程上面臨獨特的挑戰。Zcash 的 shielded transaction 使用零知識證明（zk-SNARKs）來隱藏交易金額和地址，但生成證明的計算成本較高。Monero 的 RingCT 使用環簽名來混淆交易來源，所有交易預設都是隱私的。對於需要對接這些鏈的工程師，主要挑戰在於 AML/KYT 合規：因為交易資訊被加密，傳統的鏈上分析工具效用有限。

**Cardano 的 EUTXO** 和 **Nervos CKB 的 Cell Model** 代表了 UTXO 模型的進化方向。它們在保留 UTXO 並行驗證優勢的同時，引入了更豐富的狀態管理能力。但這也帶來了新的工程挑戰，例如 UTXO contention（多筆交易同時嘗試消費同一個 UTXO），在高頻交互的 DeFi 場景中尤為明顯。

**Kaspa** 代表了 UTXO + DAG（有向無環圖）的探索方向。傳統區塊鏈是線性的（每個區塊指向前一個區塊），Kaspa 允許多個區塊同時產生並最終排序，結合 UTXO 的天然並行性，理論上可以實現更高的吞吐量和更低的確認延遲。

---

## 16.4 EUTXO（Extended UTXO）

EUTXO 在每個輸出上加入：
- **Datum（資料）**：附加在 UTXO 上的任意資料，用於承載合約狀態
- **Redeemer（花費參數）**：花費 UTXO 時提供的額外參數，用於觸發特定的邏輯分支
- **Validator Script（驗證邏輯）**：決定 UTXO 是否可以被花費的腳本程式

這讓 UTXO 可承載更複雜狀態機，但開發難度會提高。

### EUTXO 的運作方式

```text
EUTXO 交易結構：

┌───────────────────────────────────────────────────────┐
│  Input:                                                │
│    UTXO ref: txid#0                                    │
│    Redeemer: { action: "swap", amount: 100 }           │
│                                                        │
│  Referenced UTXO (被花費的 EUTXO):                     │
│  ┌──────────────────────────────────────┐              │
│  │  Value: 1000 ADA + 500 TokenA        │              │
│  │  Datum: { pool_state: ...,           │              │
│  │           reserve_a: 500,            │              │
│  │           reserve_b: 1000 }          │              │
│  │  Validator: DEX_validator.plutus      │              │
│  └──────────────────────────────────────┘              │
│                                                        │
│  Validator Execution:                                  │
│    validator(datum, redeemer, script_context) -> Bool   │
│    - 驗證 swap 比例符合 AMM 公式                       │
│    - 驗證輸出 UTXO 的 datum 正確更新                   │
│    - 驗證手續費被正確扣除                              │
│                                                        │
│  Output (新 EUTXO):                                    │
│  ┌──────────────────────────────────────┐              │
│  │  Value: 1000 ADA + 400 TokenA        │              │
│  │  Datum: { pool_state: ...,           │              │
│  │           reserve_a: 400,            │              │
│  │           reserve_b: 1100 }          │              │
│  │  Validator: DEX_validator.plutus      │              │
│  └──────────────────────────────────────┘              │
│  ┌──────────────────────────────────────┐              │
│  │  Value: 100 TokenA (user receives)   │              │
│  └──────────────────────────────────────┘              │
└───────────────────────────────────────────────────────┘
```

### EUTXO 的工程挑戰

EUTXO 模型的最大工程挑戰是 **UTXO Contention**。在 Account 模型中，多個用戶可以「同時」與同一個合約互動（雖然實際上交易會被序列化）。但在 EUTXO 模型中，每個 UTXO 只能被一筆交易消費，如果多筆交易嘗試消費同一個 UTXO（例如同一個 DEX 的流動性池），只有一筆會成功，其他都會失敗。

解決 contention 的常見策略：

1. **UTXO 分片（Output Splitting）**：將一個大的狀態 UTXO 分散到多個小 UTXO 上，讓不同交易可以並行處理不同的分片。
2. **Batching**：收集多個用戶的操作，打包成一筆交易一次處理。
3. **Off-chain Protocol**：將頻繁互動移到鏈下（如 Hydra），只在需要結算時回到鏈上。

```text
UTXO Contention 問題與解決方案：

問題：
  User A ──花費──> Pool UTXO <──花費── User B
                     ^
                     │
                User C ──花費──

  三個用戶同時要 swap，但 Pool UTXO 只有一個
  → 只有一筆交易成功，其他兩筆失敗

解決 - UTXO 分片：
  User A ──> Pool UTXO Shard 1
  User B ──> Pool UTXO Shard 2
  User C ──> Pool UTXO Shard 3
  → 三筆交易可以並行處理
  → 定期合併分片狀態
```

---

## 16.5 UTXO vs Account 的工程差異

### 狀態建模
- **UTXO**: 顯式輸入輸出，天然「來源 -> 去向」可追蹤。每筆交易的資金流向是透明的，可以從任意一個 UTXO 一路回溯到 coinbase 交易。這使得 UTXO 模型天然適合金流追蹤和稽核。但「查詢某地址餘額」需要掃描所有 UTXO，效率較低。

- **Account**: 隱式狀態更新，合約邏輯彈性大。每個地址有一個餘額數字，轉帳就是修改數字，查詢餘額只需讀取一個變數。但要追蹤資金流向，需要解析所有歷史交易的 internal transactions，複雜度高。

```text
相同交易在兩種模型下的表現：

Account Model:                    UTXO Model:
┌──────────┐                     ┌──────────┐
│ Alice     │                     │ UTXO-1   │
│ bal: 10   │─ send 3 ─>         │ 10 BTC   │──花費──>
│ bal: 7    │                     │ (Alice)  │
└──────────┘                     └──────────┘
┌──────────┐                     ┌──────────┐  ┌──────────┐
│ Bob       │                     │ UTXO-2   │  │ UTXO-3   │
│ bal: 5    │                     │ 3 BTC    │  │ 7 BTC    │
│ bal: 8    │                     │ (Bob)    │  │ (Alice)  │
└──────────┘                     └──────────┘  └──────────┘
                                              (找零回 Alice)
```

### 並行度
- **UTXO**: 不同 UTXO 可平行驗證。因為每筆交易明確宣告它要消費哪些 UTXO 和產生哪些新 UTXO，驗證節點可以同時驗證不涉及相同 UTXO 的多筆交易。這是 UTXO 模型在吞吐量方面的理論優勢。

- **Account**: 同帳戶 nonce 序列化，容易排隊。同一個帳戶的交易必須按 nonce 順序執行，不同帳戶的交易理論上可以並行，但在 EVM 中，如果交易涉及共享狀態（如同一個合約的 storage slot），仍然需要序列化。

### 費用估算
- **UTXO**: 受輸入輸出數量與見證大小影響。交易的「大小」（以 vbytes 計算）直接決定手續費。輸入越多（需要越多簽名資料），交易越大，費用越高。SegWit 和 Taproot 透過優化見證資料的權重來降低費用。

- **Account**: 受 opcode 執行與 storage 變更影響。EVM 的 gas 消耗取決於執行了哪些 opcode、以及修改了多少 storage slot。Gas estimation 需要實際模擬交易執行。

### 費用估算的 pseudocode

```python
# UTXO 費用估算
def estimate_utxo_fee(num_inputs, num_outputs, fee_rate_sat_per_vbyte):
    # SegWit P2WPKH 交易大小估算
    base_size = 10  # version + locktime + overhead
    input_size = num_inputs * 68  # per input (non-witness)
    output_size = num_outputs * 31  # per output
    witness_size = num_inputs * 107  # per input witness

    # vbytes = base_weight + witness_weight / 4
    weight = (base_size + input_size + output_size) * 4 + witness_size
    vbytes = weight / 4

    return int(vbytes * fee_rate_sat_per_vbyte)

# Account 費用估算
def estimate_account_fee(gas_used, base_fee, priority_fee):
    # EIP-1559 費用模型
    max_fee = base_fee + priority_fee
    return gas_used * max_fee
```

### 開發心智
- **UTXO**: TX graph 思維（像資料流）。開發者需要思考的是「我有哪些 UTXO 可以花費？花費後會產生哪些新的 UTXO？」。這像是一個數據管道（data pipeline），每筆交易是一個轉換節點。這種思維方式對於習慣命令式編程的開發者來說需要適應期。

- **Account**: 合約狀態機思維（像物件模型）。開發者操作的是合約的狀態變數（storage），每個函數呼叫修改狀態。這像是操作一個物件（object），呼叫方法改變屬性。對於大多數開發者來說更直覺。

---

## 16.6 UTXO 常見工程問題

### Dust UTXO
太小的輸出（如 0.00000001 BTC）造成管理成本高於其本身價值。Bitcoin Core 預設的 dust threshold 是 546 satoshis（P2PKH）或 294 satoshis（P2WPKH）。低於此門檻的 output 會被節點視為 non-standard 而拒絕中繼。

Dust 的工程影響：(1) 膨脹 UTXO 集合，增加節點記憶體消耗；(2) 花費 dust UTXO 的手續費可能超過其面額，成為「經濟上無法花費」的資產；(3) Dust attack 是一種隱私攻擊手法，攻擊者向大量地址發送極小額度的 UTXO，然後追蹤這些 UTXO 何時被花費，以分析地址之間的關聯。

### UTXO Fragmentation
輸出過碎，手續費升高。當錢包頻繁收到小額付款時，UTXO 會變得碎片化。發送一筆較大的付款時，可能需要合併數十甚至數百個小 UTXO 作為輸入，導致交易體積膨脹、手續費飆升。

解決方案是定期做 UTXO consolidation：在手續費較低的時段（如週末凌晨），將多個小 UTXO 合併成少數大 UTXO。這就像把一堆零錢拿去銀行換成大鈔。

```python
# UTXO 合併策略 pseudocode
def consolidate_utxos(wallet, fee_rate_threshold):
    current_fee_rate = get_current_fee_rate()
    if current_fee_rate > fee_rate_threshold:
        return  # 費率太高，等待低費率時段

    small_utxos = [u for u in wallet.utxos if u.value < CONSOLIDATION_THRESHOLD]
    if len(small_utxos) < MIN_CONSOLIDATION_COUNT:
        return  # 碎片不夠多，不值得合併

    # 分批合併，每批不超過 100 個 input
    for batch in chunks(small_utxos, 100):
        total = sum(u.value for u in batch)
        fee = estimate_fee(len(batch), 1, current_fee_rate)
        if total - fee > DUST_THRESHOLD:
            create_consolidation_tx(batch, wallet.change_address, fee)
```

### Coin Selection
怎麼選輸入最省費用是一個經典的最佳化問題。選擇不同的 UTXO 組合，會產生不同大小的交易和不同金額的找零，直接影響手續費和隱私。詳見 16.7 節。

### Change Management
找零地址管理錯誤造成追蹤困難。在 BIP-44 的 HD wallet 架構中，找零地址使用單獨的派生路徑（m/44'/0'/0'/1/n），與接收地址（m/44'/0'/0'/0/n）分開管理。如果找零地址管理出錯（例如找零被發送到未備份的地址），可能導致資金「消失」。

**最佳實踐**：(1) 永遠使用 HD wallet 的標準派生路徑；(2) 在發送交易前驗證找零地址確實屬於自己的錢包；(3) 定期掃描 gap limit（預設 20 個未使用地址）以外的地址，避免遺漏。

### Fee Bumping
交易卡住時要 RBF/CPFP。當交易送出後因手續費太低而長時間未被確認時，需要使用加速策略。詳見 16.8 節。

---

## 16.7 Coin Selection 策略

Coin Selection 是 UTXO 錢包的核心演算法之一，決定了交易的手續費、隱私程度、和 UTXO 碎片化程度。

### Largest First
省輸入數，可能找零過大。每次從最大面額的 UTXO 開始選取，直到累計金額足夠。優點是交易體積最小（輸入數最少），手續費最低。缺點是如果支付小額時使用了大面額 UTXO，會產生大額找零，且大 UTXO 可能是你不想動用的儲蓄。

### Branch and Bound
嘗試精準匹配，是 Bitcoin Core 自 v0.17 起的預設策略。演算法嘗試找到一組 UTXO，其金額加總恰好等於目標金額加上手續費，從而避免產生找零 output。避免找零不僅節省一個 output 的大小（減少手續費），還減少了一個新的 UTXO 進入碎片池。但精準匹配不一定總能找到，找不到時會退回其他策略。

```text
Branch and Bound 範例：
目標金額: 0.5 BTC + 0.0001 fee = 0.5001 BTC

可用 UTXO: [0.3, 0.2001, 0.15, 0.1, 0.05]

搜尋過程：
  0.3 + 0.2001 = 0.5001  精準匹配！
  → 不需要找零 output
  → 交易只有 2 inputs + 1 output
```

### Knapsack
近似最佳化，是經典的背包問題變形。在無法找到精準匹配時，使用隨機化的 knapsack 演算法選擇接近目標金額的 UTXO 組合，在手續費和找零大小之間取得平衡。

### Privacy-aware
避免地址關聯洩漏。從隱私角度考慮的 coin selection 會避免將不同來源（不同地址、不同交易）的 UTXO 混合在同一筆交易中，因為這會暴露「這些地址屬於同一個人」的資訊。更進階的做法如 CoinJoin，會將多個用戶的交易混合在一起，打斷可追蹤的鏈。

### Coin Selection 策略比較

```text
┌──────────────┬──────────┬──────────┬──────────┬──────────┐
│  策略        │ 手續費   │ 隱私性   │ 碎片化   │ 複雜度   │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ Largest First│  最低    │   差     │   高     │  O(n)    │
│ Branch&Bound │  低      │   中     │   最低   │  O(2^n)  │
│ Knapsack     │  中      │   中     │   中     │  O(n)    │
│ Privacy-aware│  高      │   最好   │   中     │  O(n^2)  │
│ Random       │  中      │   好     │   中     │  O(n)    │
└──────────────┴──────────┴──────────┴──────────┴──────────┘
```

---

## 16.8 交易加速策略

當 UTXO 交易送出後因手續費太低而卡在 mempool 中時，有兩種主要的加速策略。

### RBF（Replace-By-Fee）
同輸入替換更高手續費的交易。RBF 允許發送者在交易未確認時，使用相同的輸入（inputs）構造一筆新交易，支付更高的手續費來替換原交易。

**使用條件**：(1) 原交易必須設置 `nSequence < 0xfffffffe`（BIP-125 signaling）來表明它是可替換的；(2) 替換交易的手續費必須高於原交易；(3) 替換交易必須包含原交易的所有輸入。

```text
RBF 流程：

原交易（卡住）：                    替換交易：
┌────────────────────┐             ┌────────────────────┐
│ Input: UTXO-A      │             │ Input: UTXO-A      │
│ Output: Bob 1 BTC  │    替換     │ Output: Bob 1 BTC  │
│ Output: Alice 0.49 │   ──────>   │ Output: Alice 0.47 │
│ Fee: 0.01 BTC      │             │ Fee: 0.03 BTC      │
│ (太低，未確認)      │             │ (提高手續費)        │
└────────────────────┘             └────────────────────┘
```

**注意事項**：RBF 只對發送者有效。如果你是接收者（Bob），你無法用 RBF 來加速別人發給你的交易。此外，RBF 可能被用於「雙花」：先用低費率交易付款，等對方發貨後用 RBF 替換成付給自己的交易。因此，未確認交易不應被視為已完成的付款。

### CPFP（Child-Pays-For-Parent）
子交易抬高父交易打包誘因。CPFP 是由接收者發起的加速策略：接收者花費（未確認的）收到的 output，構造一筆新交易並支付較高的手續費。因為新交易（child）依賴於舊交易（parent），礦工要打包 child 就必須同時打包 parent，所以會按照兩筆交易的「總手續費 / 總大小」來評估打包優先級。

```text
CPFP 流程：

父交易（卡住）：                    子交易（加速）：
┌────────────────────┐             ┌────────────────────┐
│ Input: UTXO-A      │             │ Input: 父交易的     │
│ Output: Bob 1 BTC  │──────>──────│   Output (Bob 1BTC)│
│ Fee: 100 sat       │             │ Output: Bob 0.9 BTC│
│ (太低)              │             │ Fee: 10000 sat     │
└────────────────────┘             │ (高手續費)          │
                                   └────────────────────┘

礦工計算：
  Package fee rate = (100 + 10000) / (250 + 150) vbytes
                   = 10100 / 400
                   = 25.25 sat/vbyte ✓ 足以被打包
```

**工程實踐**：建議在交易服務中同時實作 RBF 和 CPFP 的自動化策略。監控已送出但未確認的交易，如果超過預期確認時間（例如 30 分鐘），自動觸發加速。對於發送方，優先使用 RBF（更經濟）；對於接收方，使用 CPFP。

---

## 16.9 UTXO 金流稽核

UTXO 模型的天然透明性使其特別適合金流追蹤和稽核。

### 基本原理

- **每一筆輸入可回溯來源 UTXO**：從任意一個 UTXO 開始，沿著 `prev_txid` 鏈一路回溯，最終一定可以追蹤到 coinbase 交易（礦工獎勵）。這個特性使得 UTXO 的「出身」（provenance）是完全透明的。

- **可建立 UTXO age / provenance 風險模型**：通過分析 UTXO 的年齡（自產生以來經過的區塊數）和來源交易鏈的風險標記，可以為每個 UTXO 計算風險分數。例如：來自已知混幣服務（mixer）的 UTXO 會被標記為高風險；來自知名交易所的 UTXO 通常被視為低風險。

- **建議建立地址分群與風險標記（內部可見）**：使用 clustering 演算法（如 common-input-ownership heuristic）將可能屬於同一實體的地址分組，並標記風險等級。這些標記僅供內部風控使用，不應公開。

### UTXO 稽核圖（Transaction Graph）

```text
稽核追蹤範例：

Coinbase (Block 100)
  │
  └──> UTXO-1 (50 BTC, Miner)
         │
         ├──> UTXO-2 (30 BTC, Exchange A) ──> UTXO-4 (29 BTC, User X)
         │                                      │
         │                                      └──> UTXO-6 (28.9 BTC, ???)
         │                                           ⚠ 流入未知地址，風險升高
         │
         └──> UTXO-3 (19.99 BTC, Exchange A)
                │
                └──> UTXO-5 (10 BTC, Known Cold Wallet) ✓ 低風險
```

### 稽核工具與實踐

對於需要進行 UTXO 金流稽核的團隊，常用的工具包括：
- **Chainalysis / Elliptic**：商業級鏈上分析平台，提供地址風險評分和交易圖譜
- **OXT.me**：開源的 Bitcoin 交易分析工具
- **自建 UTXO indexer**：對於有特殊需求的團隊，可以基於 Bitcoin Core 的 `-txindex` 功能或 Electrum Server 來建立自己的 UTXO 索引

---

## 16.10 UTXO 多簽

### 常見腳本路線

- **Bitcoin Script 多簽（historical）**：最早的多簽實現，使用 `OP_CHECKMULTISIG` opcode。缺點是所有公鑰都暴露在腳本中，且有一個 off-by-one bug（dummy element）。

- **P2WSH / Taproot policy（現代實務）**：P2WSH（Pay to Witness Script Hash）將多簽腳本放在 witness 中，節省交易大小。Taproot（P2TR）進一步優化：在大家都同意的情況下，可以用 key path spending 生成一個普通的 Schnorr 簽名，在鏈上完全看不出是多簽交易；只有在需要回退機制時才使用 script path 揭示多簽腳本。

- **Threshold 方案（MuSig2 類聚合簽名）**：MuSig2 允許多個簽名者協作產生一個標準的 Schnorr 簽名，在鏈上與普通的單簽名交易完全相同。這提供了最好的隱私保護和最低的交易費用，但實現複雜度較高，且需要多輪通信。

```text
三種多簽方案在鏈上的表現：

Legacy OP_CHECKMULTISIG:
  scriptPubKey: 2 <PubKey1> <PubKey2> <PubKey3> 3 OP_CHECKMULTISIG
  → 鏈上可見：多簽、3個公鑰、2-of-3 門檻
  → 費用：高（暴露所有公鑰）

Taproot Key Path (所有人同意時):
  output: <aggregated_public_key>
  witness: <aggregated_signature>
  → 鏈上可見：普通交易
  → 費用：最低（與單簽名相同）

Taproot Script Path (回退機制):
  output: <internal_key> + <merkle_root>
  witness: <sig1> <sig2> <multisig_script> <merkle_proof>
  → 鏈上可見：Taproot 腳本花費
  → 費用：中等
```

### 重點控制項

- **門檻策略 M-of-N**：M（簽名門檻）和 N（總簽名者數）的選擇取決於安全需求和可用性。常見配置：2-of-3（小型團隊、日常操作）、3-of-5（機構國庫、中等金額）、4-of-7（大型 DAO 國庫、重大變更）。M 太低會降低安全性，M 太高會降低可用性（需要太多人同時在線簽名）。

- **輸出模板白名單**：限制多簽錢包只能向預先批准的地址轉帳。這可以透過 Bitcoin Script 的 `OP_CHECKTEMPLATEVERIFY`（BIP-119，尚未啟用）或鏈下的 policy engine 來實現。在 policy engine 模式下，簽名者在簽名前會驗證交易的輸出是否符合白名單規則。

- **時鎖（絕對/相對）**：`OP_CHECKLOCKTIMEVERIFY`（CLTV，BIP-65）用於絕對時間鎖（交易在某個區塊高度或時間戳之後才能生效）；`OP_CHECKSEQUENCEVERIFY`（CSV，BIP-112）用於相對時間鎖（交易在輸入的 UTXO 被確認後的一段時間後才能花費）。時鎖可用於實現定期結算、延遲執行等機制。

- **緊急恢復路徑（social recovery）**：如果主要簽名者的密鑰全部遺失或無法使用，需要有備用的恢復機制。常見做法是在 Taproot 的 script tree 中預設一個「N+M 天後，恢復密鑰可以單獨花費」的分支。例如：正常路徑是 2-of-3 多簽，恢復路徑是「180 天後，恢復密鑰可以單獨轉出資金到指定的冷錢包」。

---

## 16.11 UTXO 安全檢查清單

以下是 UTXO 系統上線前必須確認的安全檢查項：

### - [ ] 地址與腳本型別檢查（P2PKH/P2WPKH/P2TR 等）

確保系統正確處理所有支援的地址格式。不同的地址格式對應不同的腳本類型和費用結構。混用地址格式可能導致相容性問題。建議優先使用 Bech32/Bech32m 地址（P2WPKH/P2TR），它們的費用最低且有內建的錯誤檢測。

### - [ ] Coin selection 策略與隱私策略分離

Coin selection 不僅影響費用，還影響隱私。對於有隱私需求的系統，coin selection 策略應避免將不同來源的 UTXO 混合在同一筆交易中。建議將 coin selection 策略設計為可配置的，讓不同的業務場景使用不同的策略。

### - [ ] 交易模擬與費率估算多來源比對

費率估算應參考多個資料來源（如 mempool.space、bitcoinfees.earn.com、本地節點的 `estimatesmartfee`），並取中位數或加權平均。單一來源的費率估算可能因為網路條件突變而失準。

### - [ ] Change output 不落到錯誤地址池

確保找零 output 使用正確的派生路徑，且地址確實屬於自己的錢包。在多 HD wallet 或多 account 的環境中，找零地址被送到錯誤的 account 是一個常見的 bug。每筆交易送出前都應驗證找零地址的所有權。

### - [ ] 大額轉帳使用多簽 + 時鎖

對於超過預設門檻的轉帳（例如 > 1 BTC），強制使用多簽 wallet 並附加 timelock。這為大額交易提供了額外的安全保障，即使某個簽名者的密鑰被盜，攻擊者也無法在 timelock 期限內轉出資金。

### - [ ] 卡交易有 RBF/CPFP runbook

準備明確的操作手冊，描述交易卡住時的處理步驟：如何判斷交易是否真的卡住（而非僅僅是延遲）、何時觸發 RBF、何時使用 CPFP、以及自動化加速的觸發條件和費率上限。

---

## 16.12 什麼場景適合 UTXO

### 高審計要求的資產結算

UTXO 的天然可追蹤性使其成為需要嚴格稽核的資產結算系統的理想選擇。每一筆資金的來源和去向都可以透過 transaction graph 完整追蹤，不需要額外的索引系統。對於需要向監管機構證明資金來源合法性的機構，UTXO 模型比 Account 模型更容易產出清晰的稽核報告。

### 需簡潔可驗證的支付引擎

如果你的核心需求是「安全地從 A 轉帳到 B」，UTXO 模型提供了最簡潔的驗證邏輯：檢查輸入是否有效、簽名是否正確、金額是否守恆。不需要理解複雜的合約邏輯或狀態轉換。這使得 UTXO 系統的安全審計範圍小、可驗證性強。

### 不追求複雜共享合約狀態

UTXO 模型不適合需要多方頻繁交互同一個共享狀態的場景（如 AMM DEX、借貸協議）。如果你的應用主要是點對點支付、資產發行與轉讓、或簡單的多簽託管，UTXO 是很好的選擇。如果你需要複雜的 DeFi 邏輯，Account 模型（或 EUTXO 的特殊設計）更適合。

### 決策矩陣

```text
你的場景適合 UTXO 嗎？

需要複雜合約邏輯？ ──是──> Account 模型 (Ethereum/Solana)
      │
      否
      │
需要高頻交互共享狀態？ ──是──> Account 模型 或 EUTXO + 特殊設計
      │
      否
      │
需要強稽核追蹤？ ──是──> UTXO (Bitcoin/Litecoin)
      │
      否
      │
需要交易隱私？ ──是──> Privacy UTXO (Zcash/Monero)
      │
      否
      │
需要高吞吐低延遲？ ──是──> UTXO + DAG (Kaspa)
      │
      否
      │
簡單支付場景 ──> UTXO (Bitcoin/Litecoin)
```

---

## 白話總結

UTXO 就像你皮夾裡一堆紙鈔。你的「餘額」不是一個數字，而是你手上所有紙鈔面額加起來的結果。每次付款時，你從皮夾裡挑幾張鈔票出來（input），把該付的金額給對方（output），找零的部分以新紙鈔的形式回到你手上（change output），差額就是給收銀員的小費（miner fee）。

這種模型最大的好處是「可追蹤」：每一張紙鈔（UTXO）都有明確的來源，你可以一路追溯到它最初被印出來的那一刻（coinbase 交易）。這讓 UTXO 特別適合需要稽核的資產系統。另一個好處是天然的並行性：因為不同的紙鈔互不干擾，多筆不涉及相同紙鈔的交易可以同時驗證。

但 UTXO 也有它的工程痛點。紙鈔會碎片化（一堆零錢比大鈔難管理），選幣策略會影響手續費和隱私，找零管理出錯會導致資金「消失」，交易卡住時需要 RBF 或 CPFP 來加速。EUTXO 試圖在紙鈔上寫上更多資訊，讓紙鈔不只是紙鈔、還能承載合約狀態，但這也讓開發難度上升了一個量級。

總結來說：如果你的需求是簡潔安全的支付和結算、需要清晰的金流追蹤、不需要複雜的共享合約狀態，UTXO 是成熟且可靠的選擇。Bitcoin 十多年的安全運行紀錄就是最好的證明。

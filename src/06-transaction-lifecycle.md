# 6. 交易生命週期與 Gas 市場

## 6.1 生命週期

一筆區塊鏈交易從構思到最終確認，會經歷多個明確的階段。每個階段都有可能出錯，你的系統必須能夠追蹤和處理每一個狀態。以下是 EVM 鏈上交易的完整生命週期。

### 1. 建構交易（nonce / gas / data / value）

交易建構是第一步，你需要組裝一個包含以下欄位的交易物件：

- **nonce**：發送者帳戶的交易序號，必須嚴格遞增。查詢方式：`eth_getTransactionCount(address, "pending")`
- **to**：目標地址。合約呼叫時是合約地址，部署合約時為 null
- **value**：轉帳的 ETH 數量（以 wei 為單位，1 ETH = 10^18 wei）
- **data**：合約呼叫時的 calldata（ABI 編碼後的函式選擇器 + 參數），純轉帳時可為空
- **gasLimit**：本次交易最多可消耗的 Gas 上限
- **maxFeePerGas** / **maxPriorityFeePerGas**：EIP-1559 的費用參數

```python
# Pseudocode: 交易建構範例
tx = {
    "chainId": 1,                          # Ethereum Mainnet
    "nonce": await get_nonce(sender),       # 當前帳戶 nonce
    "to": "0xdAC17F958D2ee523a2206206994597C13D831ec7",  # USDT 合約
    "value": 0,                            # 不轉 ETH
    "data": encode_abi(                    # ABI 編碼
        "transfer(address,uint256)",
        [recipient, amount]
    ),
    "maxFeePerGas": base_fee * 2 + priority_fee,
    "maxPriorityFeePerGas": priority_fee,
    "gas": estimated_gas * 1.2,            # 留 20% 緩衝
}
```

**常見陷阱**：`gasLimit` 設太低會導致 out of gas（交易失敗但 Gas 照扣），設太高不會多收費（只收實際消耗量），但會佔用區塊空間，影響打包優先度。建議使用 `eth_estimateGas` 的結果乘以 1.1-1.2 的安全係數。

### 2. 本地或服務端模擬

在簽名和廣播之前，應該先用 `eth_call` 模擬交易的執行結果。模擬會在 EVM 中「假裝」執行這筆交易，返回執行結果或錯誤資訊，但不會真的改變鏈上狀態。

模擬的價值在於：
- **避免浪費 Gas**：如果交易會 revert，模擬會提前告訴你，省去上鏈後才發現失敗的成本
- **預測結果**：可以看到代幣餘額的變化，確認交易行為符合預期
- **安全檢查**：模擬可以偵測到一些詐騙合約（例如只能買不能賣的 token）

```text
模擬流程：

  建構好的交易 (unsigned)
        │
        v
  ┌─────────────────────────────┐
  │ eth_call (模擬)              │
  │                             │
  │ 成功 → 返回執行結果          │
  │   - return data             │
  │   - gas used                │
  │   - state changes (trace)   │
  │                             │
  │ 失敗 → 返回 revert reason   │
  │   - "insufficient balance"  │
  │   - "slippage too high"     │
  │   - custom error bytes      │
  └──────────────┬──────────────┘
                 │
        ┌────────┴────────┐
        v                 v
   模擬成功            模擬失敗
   → 進入簽名          → 停止，調查原因
```

**進階工具**：Tenderly、Blocknative 等第三方服務提供更詳細的模擬結果，包括完整的 execution trace、state diff、event logs，甚至可以模擬多筆交易的組合執行效果。

### 3. 簽名

使用私鑰對序列化後的交易資料進行 ECDSA 簽名，產出 `v`, `r`, `s` 三個值。簽名後的交易可以被任何節點驗證——只要從簽名中恢復出的公鑰對應的地址與 `from` 欄位一致即可。

簽名是不可逆的——一旦你簽了一筆交易，任何人拿到這個簽名後的交易都可以廣播上鏈。因此，簽名前的所有檢查（策略、模擬、風控）都必須在簽名之前完成。

### 4. 廣播到 Mempool

簽名後的交易透過 `eth_sendRawTransaction` 發送到 RPC 節點，節點會進行初步驗證（簽名正確、nonce 合法、餘額足夠支付 Gas）後放入本地 mempool，並透過 P2P 網路傳播給其他節點。

這個階段的風險是**交易被觀察和搶跑**。任何人都可以訂閱 `pending transactions`，觀察你的交易內容。如果你的交易是一筆有利可圖的 DeFi 操作（如大額 swap），MEV 搜尋者可能會搶先執行類似交易來獲利。

### 5. 打包出塊

出塊者（validator）從 mempool 中選擇交易打包進新區塊。在 PBS 架構下，實際的區塊組裝由 builder 完成，builder 根據 Gas 費排序交易以最大化收益，然後將區塊方案提交給 proposer。

交易被打包進區塊後，會獲得一個確定的位置：block number + transaction index。此時交易的狀態從 `pending` 變為 `included`。

### 6. 達到確認與最終性

交易被包含在區塊中並不意味著「最終確定」。在 Proof of Work 時代，需要等待多個後續區塊（如 Bitcoin 的 6 個確認）才能認為交易不可逆。在 Ethereum 的 Proof of Stake 機制下，交易需要等待約 12-15 分鐘才能達到 finality（最終性）——此後除非超過 1/3 的驗證者串謀作惡，否則交易無法被撤銷。

```text
確認等級與風險：

  時間軸 ──────────────────────────────────────>

  Pending    Included   1 confirm  12 confirm  Finalized
    │          │          │          │            │
    │          │          │          │            │
    ▼          ▼          ▼          ▼            ▼
  風險: 高   風險: 中    風險: 低   風險: 極低   風險: ~0

  可被 drop  可被 reorg  reorg 機率  接近不可逆  協議保證
  或 replace 1-2 塊深    極低                   不可逆

  業務建議:
  - 小額 (<$100):   1 confirm 即可確認
  - 中額 ($100-10K): 12 confirms
  - 大額 (>$10K):   等待 finality
  - 交易所入金:      根據幣種設定不同確認數
```

---

## 6.2 EVM Gas（EIP-1559）

EIP-1559 是 Ethereum 在 2021 年 London 升級中引入的費率機制改革，徹底改變了 Gas 費的計價方式。理解 EIP-1559 對於正確設定交易費用至關重要。

### `baseFee`: 協議燃燒

Base fee 是由協議根據前一個區塊的填充率自動計算的最低費用。**這筆費用不會給任何人，而是直接被燃燒（銷毀）**，減少 ETH 的流通量。

Base fee 的調整規則：
- 如果上一個區塊的 Gas 使用量超過目標值（15M Gas），base fee 上升，最多上升 12.5%
- 如果低於目標值，base fee 下降，最多下降 12.5%
- 目標是讓區塊平均約 50% 滿

```text
Base Fee 動態調整示意：

  Block N:   Gas Used = 30M (100% 滿)  → baseFee 上升 12.5%
  Block N+1: Gas Used = 25M (83% 滿)   → baseFee 上升 ~8%
  Block N+2: Gas Used = 15M (50% 滿)   → baseFee 不變
  Block N+3: Gas Used = 10M (33% 滿)   → baseFee 下降 ~4%
  Block N+4: Gas Used = 0   (空塊)     → baseFee 下降 12.5%

  baseFee
    ▲
    │    ╱╲
    │   ╱  ╲
    │  ╱    ╲───────╲
    │ ╱               ╲
    │╱                  ╲──
    └───────────────────────> 區塊
         網路擁堵      正常    空閒
```

### `priorityFee`: 給出塊者小費

Priority fee（也稱為 tip）是使用者額外支付給出塊者的費用，用於激勵出塊者將你的交易優先打包。在不擁堵時，1-2 gwei 的 priority fee 通常就足夠。在擁堵時，你需要提高 priority fee 才能被優先打包。

### `maxFee`: 使用者可接受上限

`maxFeePerGas` 是使用者願意為每單位 Gas 支付的最高價格。實際支付的 Gas 費用為：`min(maxFeePerGas, baseFee + maxPriorityFeePerGas)`。如果 `maxFeePerGas` 低於當前的 `baseFee`，交易會留在 mempool 中等待 baseFee 下降。

```text
EIP-1559 費用計算：

  使用者設定:
    maxFeePerGas         = 100 gwei
    maxPriorityFeePerGas = 2 gwei

  當前狀態:
    baseFee              = 30 gwei

  實際費用:
    effectiveGasPrice = baseFee + priorityFee
                      = 30 + 2
                      = 32 gwei

  費用分配:
    燃燒 (burn):      30 gwei × gasUsed → 從流通中移除
    出塊者收入 (tip):  2 gwei × gasUsed → validator 收入
    退還使用者:        (100 - 32) × gasUsed → 不收取

  如果 baseFee 漲到 110 gwei:
    → 交易無法被打包 (maxFee < baseFee)
    → 留在 mempool 等待 baseFee 下降
    → 或使用者 speed up (重送更高 maxFee)
```

### Gas 費估算策略

```python
# Pseudocode: 動態 Gas 費估算
async def estimate_gas_fees(rpc, urgency="normal"):
    # 取得最新區塊的 baseFee
    latest_block = await rpc.get_block("latest")
    current_base_fee = latest_block["baseFeePerGas"]

    # 取得歷史 priority fee 分佈
    fee_history = await rpc.fee_history(
        block_count=10,
        newest_block="latest",
        reward_percentiles=[25, 50, 75]
    )

    if urgency == "low":
        # 不急: 目標下一個 baseFee，低 priority
        max_priority = fee_history.reward[25th_percentile]
        max_fee = current_base_fee * 1.1 + max_priority
    elif urgency == "normal":
        # 正常: 當前 baseFee 的 1.5 倍緩衝
        max_priority = fee_history.reward[50th_percentile]
        max_fee = current_base_fee * 1.5 + max_priority
    elif urgency == "high":
        # 緊急: 當前 baseFee 的 2 倍
        max_priority = fee_history.reward[75th_percentile]
        max_fee = current_base_fee * 2 + max_priority

    return {
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": max_priority
    }
```

---

## 6.3 交易失敗型態

交易失敗不是一個簡單的「成功/失敗」二元結果——不同的失敗模式有不同的原因、不同的 Gas 消耗行為、和不同的處理策略。

### Out of Gas

當交易執行過程中消耗的 Gas 超過了 `gasLimit`，EVM 會立即中止執行並 revert 所有狀態變更。**但已消耗的 Gas 不會退還**——這是最昂貴的失敗模式之一。

常見原因：
- `gasLimit` 設得太保守（例如使用固定值 21000，但實際是合約呼叫）
- 合約中有無限迴圈或極深的遞迴
- 合約升級後 Gas 消耗增加，但呼叫端沒有更新估算

### Revert（require / assert / custom error）

Revert 是合約主動拒絕執行。與 out of gas 不同，revert 會退還未使用的 Gas。

```solidity
// Solidity 中的 revert 來源
function transfer(address to, uint256 amount) external {
    // require: 條件不滿足時 revert，包含錯誤訊息
    require(balanceOf[msg.sender] >= amount, "Insufficient balance");

    // assert: 理論上不應該發生的情況，用於捕捉 bug
    assert(totalSupply >= amount);

    // custom error: Solidity 0.8.4+ 更省 Gas 的錯誤格式
    if (to == address(0)) revert ZeroAddressNotAllowed();

    balanceOf[msg.sender] -= amount;
    balanceOf[to] += amount;
}
```

**工程建議**：你的系統應該解碼 revert reason，將其轉換為對使用者有意義的錯誤訊息。例如，`"Insufficient balance"` 可以告訴使用者他們的餘額不足，而不是顯示一個不明所以的交易失敗通知。

### Nonce Too Low / High

- **Nonce too low**：表示你提交的 nonce 已經被使用過。可能原因：交易已被打包但你的系統還不知道，或你正在重送一筆已確認的交易。
- **Nonce too high**：你提交的 nonce 比預期的下一個 nonce 大。中間有 nonce 缺口，RPC 節點會拒絕這筆交易（某些節點會接受並放入 mempool 等待缺口被填補）。

```text
Nonce 錯誤場景：

  帳戶當前 confirmed nonce: 5

  提交 nonce = 3  → "Nonce too low" (已使用過)
  提交 nonce = 5  → 正常 (下一筆應用的 nonce)
  提交 nonce = 7  → "Nonce too high" (跳過 6)
  提交 nonce = 5  → 如果之前 nonce=5 還在 pending，
                     則為替換交易 (需更高 Gas)
```

### Slippage 保護觸發

在 DEX 交易中，slippage tolerance（滑點容忍度）用於保護使用者免受價格大幅波動的影響。如果交易執行時的實際價格偏離預期超過設定的滑點，合約會 revert。

典型場景：你設定 0.5% 的滑點容忍，但在你的交易被打包之前，有人執行了大額 swap 改變了價格。如果價格變動超過 0.5%，你的交易會 revert。這不是 bug，而是保護機制在正常工作。

**但過寬的滑點設定是危險的**——如果你設定 50% 的滑點，等於邀請三明治攻擊。MEV 搜尋者可以在你的交易前後各插一筆交易，先推高價格讓你以高價買入，再賣出獲利。

---

## 6.4 MEV 與排序風險

MEV（Maximal Extractable Value）是指區塊生產者（或與其合作的搜尋者）通過重新排序、插入或移除區塊中的交易所能獲取的最大利潤。MEV 是區塊鏈系統中一個深刻的結構性問題，對交易工程有直接影響。

### Front-running

搶跑（front-running）是指觀察到使用者的待處理交易後，搶先提交一筆類似的交易以從中獲利。經典場景是在 DEX 上：搜尋者看到你即將以市價買入大量 token，就搶先買入推高價格，你被迫以更高價成交。

```text
Front-running 攻擊流程：

  時間軸 ────────────────────────────────>

  1. User 提交: swap 100 ETH → TokenA
     (mempool 中可見)
         │
         v
  2. Searcher 觀察到大額 swap
     Searcher 提交: swap 10 ETH → TokenA (更高 Gas)
         │
         v
  3. 區塊打包順序:
     ┌─────────────────────────┐
     │ Tx1: Searcher 買入      │ ← 先執行，價格上升
     │ Tx2: User 買入 (高價)   │ ← 被迫以更高價成交
     └─────────────────────────┘

  結果: User 多付了價差，Searcher 獲利
```

### Sandwich Attack

三明治攻擊是 front-running 的進化版。攻擊者在目標交易前後各插入一筆交易：先買入推高價格（front-run），等目標交易以高價執行後，再賣出獲利（back-run）。

```text
Sandwich Attack 結構：

  區塊中的交易順序:

  ┌─────────────────────────────────────┐
  │ Tx1 (Attacker): Buy TokenA          │  ← 推高價格
  │                 花 10 ETH 買 1000 A │
  │                                     │
  │ Tx2 (Victim):   Buy TokenA          │  ← 以高價成交
  │                 花 100 ETH 買 9500 A│  (本應得 10000 A)
  │                                     │
  │ Tx3 (Attacker): Sell TokenA         │  ← 賣出獲利
  │                 賣 1000 A 得 10.5 ETH│
  └─────────────────────────────────────┘

  Attacker 利潤: 0.5 ETH
  Victim 損失:   500 TokenA (約 0.5 ETH 等值)
```

### Back-running

尾隨（back-running）是在某筆交易之後緊接著執行的套利行為。例如：某個大額 swap 改變了 DEX 的價格，back-runner 緊接著在不同 DEX 之間套利。Back-running 通常不傷害使用者（使用者的交易已正常執行），但它展示了 MEV 的普遍性。

### 工程防禦手段

```text
MEV 防護策略矩陣：

┌──────────────────────┬─────────────────┬───────────────────┐
│ 策略                 │ 防護效果        │ 代價              │
├──────────────────────┼─────────────────┼───────────────────┤
│ 私有 RPC / Builder   │ 避免 mempool    │ 依賴中心化服務    │
│ (Flashbots Protect)  │ 曝光            │                   │
├──────────────────────┼─────────────────┼───────────────────┤
│ 交易批次化           │ 減少個別交易    │ 增加系統複雜度    │
│ (Batch transactions) │ 被觀察的機會    │                   │
├──────────────────────┼─────────────────┼───────────────────┤
│ 嚴格滑點保護         │ 限制攻擊者      │ 可能導致交易      │
│ (0.1-1% slippage)    │ 可獲利空間      │ 更容易失敗        │
├──────────────────────┼─────────────────┼───────────────────┤
│ Deadline 參數         │ 防止延遲執行    │ 需要合理設定      │
│ (交易過期時間)        │                │                   │
├──────────────────────┼─────────────────┼───────────────────┤
│ Commit-Reveal 機制    │ 隱藏交易意圖    │ 需要兩筆交易      │
│                      │ 直到揭露        │ 增加延遲和成本    │
└──────────────────────┴─────────────────┴───────────────────┘
```

**實務建議**：

1. **DeFi 交易必設 deadline**：在 Uniswap 等 DEX 交易中，永遠設定 `deadline` 參數（例如當前時間 + 300 秒）。沒有 deadline 的交易可能被刻意延遲到對攻擊者有利的時刻再執行。

2. **使用 Flashbots Protect 或類似服務**：對於主網上的高價值交易，通過 `https://rpc.flashbots.net` 發送交易，避免在公開 mempool 中曝光。

3. **監控 MEV 損失**：使用 EigenPhi、Flashbots Explorer 等工具，定期檢查你的地址是否曾遭受 MEV 攻擊，並據此調整防護策略。

---

## 6.5 狀態機視角

從工程角度來看，交易的生命週期本質上是一個**有限狀態機（Finite State Machine）**。你的交易追蹤系統應該明確建模每個狀態和狀態轉換。

```text
交易狀態機完整定義：

                  ┌──────────────────────┐
                  │                      │
                  v                      │
  Draft ──→ Signed ──→ Pending ──→ Included ──→ Confirmed(k) ──→ Finalized
                         │           │     │
                         │           │     └──→ Reverted (交易失敗，但被包含在區塊中)
                         │           │
                         │           └──→ Uncle/Ommer (區塊被棄用，交易回到 Pending)
                         │
                         ├──→ Dropped (節點 mempool 滿，交易被丟棄)
                         │
                         └──→ Replaced (同 nonce 的新交易被打包，取代原交易)


狀態轉換觸發條件：

  Draft → Signed:       私鑰簽名完成
  Signed → Pending:     廣播到至少一個節點
  Pending → Included:   交易被打包進區塊
  Pending → Dropped:    mempool 過期 (通常 ~6 小時) 或節點重啟
  Pending → Replaced:   同 nonce 更高 Gas 的交易被打包
  Included → Confirmed: 後續區塊持續增加
  Included → Reverted:  交易執行失敗 (out of gas, require fail)
  Included → Uncle:     區塊被 reorg 棄用
  Confirmed → Finalized: 達到協議最終性 (PoS: ~12 min)
```

### 狀態追蹤的工程實現

```python
# Pseudocode: Transaction State Machine
from enum import Enum

class TxState(Enum):
    DRAFT = "draft"
    SIGNED = "signed"
    PENDING = "pending"
    INCLUDED = "included"
    CONFIRMED = "confirmed"
    FINALIZED = "finalized"
    REVERTED = "reverted"
    DROPPED = "dropped"
    REPLACED = "replaced"

class TransactionTracker:
    def __init__(self, tx_hash, rpc):
        self.tx_hash = tx_hash
        self.state = TxState.PENDING
        self.block_number = None
        self.confirmations = 0
        self.rpc = rpc

    async def poll_status(self):
        receipt = await self.rpc.get_transaction_receipt(self.tx_hash)

        if receipt is None:
            # 仍在 mempool 或已被 drop
            pending_tx = await self.rpc.get_transaction(self.tx_hash)
            if pending_tx is None:
                self.state = TxState.DROPPED
            else:
                self.state = TxState.PENDING
            return

        self.block_number = receipt["blockNumber"]

        if receipt["status"] == 0:
            self.state = TxState.REVERTED
            return

        latest_block = await self.rpc.get_block_number()
        self.confirmations = latest_block - self.block_number + 1

        if self.confirmations >= FINALITY_THRESHOLD:  # e.g., 64 for Ethereum
            self.state = TxState.FINALIZED
        elif self.confirmations >= CONFIRMATION_THRESHOLD:  # e.g., 12
            self.state = TxState.CONFIRMED
        else:
            self.state = TxState.INCLUDED
```

**關鍵設計決策**：

- **輪詢 vs 訂閱**：可以用 `eth_subscribe("newHeads")` 監聽新區塊來觸發狀態更新，而非定時輪詢。但 WebSocket 連接可能斷開，因此需要 fallback 到輪詢機制。
- **Reorg 處理**：即使交易已被確認 3 個區塊，仍有可能因為 reorg 而被撤銷。你的狀態機必須允許 `CONFIRMED → PENDING` 的回退。
- **Timeout 策略**：如果交易在 mempool 中停留超過設定時間（如 30 分鐘），應該自動嘗試 speed up（重送更高 Gas）或 cancel（送同 nonce 的空交易）。

---

## 6.6 UTXO 交易生命週期

Bitcoin 和其他 UTXO 模型的區塊鏈有著與 EVM 帳戶模型完全不同的交易結構。UTXO（Unspent Transaction Output）模型中，沒有「帳戶餘額」的概念——你的「餘額」是所有指向你地址的未花費交易輸出的總和。

### 1. Coin Selection（選哪些 UTXO 當 inputs）

要建構一筆交易，首先要從你擁有的 UTXO 集合中選擇足夠的輸入。這個過程稱為 coin selection，是一個涉及隱私、費用和 UTXO 集合管理的最佳化問題。

```text
Coin Selection 範例：

  你的 UTXO 集合：
  ┌─────────────────────────────────┐
  │ UTXO_1: 0.3 BTC (txid:abc...#0)│
  │ UTXO_2: 0.5 BTC (txid:def...#1)│
  │ UTXO_3: 1.2 BTC (txid:ghi...#2)│
  │ UTXO_4: 0.1 BTC (txid:jkl...#0)│
  └─────────────────────────────────┘

  目標: 發送 0.7 BTC

  策略 A (最少輸入): 使用 UTXO_3 (1.2 BTC)
    → 找零 = 1.2 - 0.7 - fee ≈ 0.4998 BTC
    → 優點: 交易體積小，費用低
    → 缺點: 產生大額找零

  策略 B (精確匹配): 使用 UTXO_1 + UTXO_2 (0.8 BTC)
    → 找零 = 0.8 - 0.7 - fee ≈ 0.0998 BTC
    → 優點: 找零小，隱私較好
    → 缺點: 兩個輸入，交易體積略大
```

常見的 coin selection 演算法：
- **Largest First**：選最大的 UTXO，簡單但可能產生大額找零
- **Branch and Bound**：嘗試找到精確匹配（無找零）的組合
- **Random Selection**：隨機選擇以提高隱私性

### 2. 估算 Fee Rate（sat/vB 等）

Bitcoin 的交易費用按照交易的虛擬位元組（virtual bytes, vB）計價，而非固定金額。你需要根據當前 mempool 的擁堵程度來設定適當的 fee rate。

```text
Bitcoin Fee Rate 估算：

  Mempool 狀態:
  ┌────────────────────────────────────┐
  │ 下一區塊 (≤10 min): 50+ sat/vB   │
  │ 1-3 區塊 (≤30 min): 30-50 sat/vB │
  │ 3-6 區塊 (≤1 hour): 10-30 sat/vB │
  │ 低優先 (數小時):    1-10 sat/vB   │
  └────────────────────────────────────┘

  交易大小估算:
  - P2WPKH 1-in-1-out: ~110 vB
  - P2WPKH 2-in-2-out: ~208 vB
  - P2TR  1-in-1-out:  ~112 vB

  費用計算:
  交易費 = fee_rate (sat/vB) × 交易大小 (vB)
  例: 50 sat/vB × 208 vB = 10,400 sat ≈ 0.000104 BTC
```

### 3. 產生 Outputs（收款 + Change）

一筆 UTXO 交易通常有兩個輸出：一個是給收款人的金額，另一個是找零（change）——把多餘的金額退回給自己。找零地址通常使用新的地址以提高隱私性。

**常見陷阱**：如果你忘記加上找零輸出，所有的「多餘」金額都會變成礦工費。曾有使用者因為這個錯誤付了 500 BTC 的手續費。

### 4. 本地簽名（含 Witness）

在 SegWit（隔離見證）交易中，簽名資料被放在 witness 區域，不計入傳統的交易大小。這有效降低了交易費用，並解決了交易延展性（transaction malleability）問題。

### 5. 廣播與 Mempool 排序

Bitcoin 的 mempool 按 fee rate 排序。與 Ethereum 不同，Bitcoin 沒有 nonce 的概念——同一個地址的多筆交易之間不需要嚴格排序（但花費同一個 UTXO 的交易會互相衝突）。

### 6. 必要時 RBF / CPFP 加速

如果交易卡在 mempool 中，有兩種加速方式：

- **RBF（Replace-By-Fee）**：重新建構一筆花費相同 UTXO 但 fee rate 更高的交易。原交易必須在建構時設定了 RBF 信號（nSequence < 0xFFFFFFFE）。
- **CPFP（Child-Pays-For-Parent）**：建構一筆新交易花費卡住交易的找零輸出，並為新交易設定足夠高的 fee rate。礦工為了收取子交易的費用，會連同父交易一起打包。

```text
RBF vs CPFP 比較：

  RBF (Replace-By-Fee):
  ┌──────────────────────────────┐
  │ 原交易 (5 sat/vB) → 作廢    │
  │ 替換交易 (50 sat/vB) → 打包 │
  │                              │
  │ 條件: 原交易設有 RBF 信號    │
  │ 優點: 可以修改任何欄位       │
  │ 缺點: 接收者看到交易消失     │
  └──────────────────────────────┘

  CPFP (Child-Pays-For-Parent):
  ┌──────────────────────────────┐
  │ 父交易 (5 sat/vB) ─┐        │
  │                     │ 一起   │
  │ 子交易 (100 sat/vB)─┘ 打包   │
  │                              │
  │ 條件: 有可花費的找零輸出     │
  │ 優點: 不影響原交易           │
  │ 缺點: 額外交易費用           │
  └──────────────────────────────┘
```

### 7. 入塊後按確認數提升信任等級

Bitcoin 沒有協議層的最終性保證——理論上任何交易都可以被更長的鏈覆蓋。但隨著後續區塊的增加，覆蓋的計算成本呈指數級增長。業界慣例的確認數：

- 小額交易：1-2 個確認（10-20 分鐘）
- 中等金額：3-6 個確認（30-60 分鐘）
- 大額交易（交易所入金）：6 個確認（約 1 小時）
- 極大額交易：可能要求 30-60 個確認

---

## 白話總結

一筆交易從你按下「發送」到真正「不可逆」，中間要經過建構、模擬、簽名、廣播、進入 mempool、被打包出塊、累積確認數、最終達到 finality 這一連串的步驟。你的系統不能只關心「成功」和「失敗」兩種結果——交易可能卡在 mempool（pending）、被更高 Gas 的交易替換（replaced）、被節點丟棄（dropped）、執行失敗但仍被包含在區塊中（reverted）、甚至已經確認又因為 reorg 而被撤銷。Gas 費不是一個固定數字，它是一個動態市場——base fee 根據網路擁堵程度自動調整，priority fee 是你給出塊者的小費。MEV 是一個你必須面對的現實：如果你的大額 DeFi 交易在公開 mempool 中暴露，搜尋者可能會搶跑或三明治攻擊你。防禦手段包括使用私有交易通道、設定嚴格的滑點保護、以及為交易設定 deadline。UTXO 模型（Bitcoin）和帳戶模型（Ethereum）的交易結構完全不同——UTXO 沒有 nonce，但有 coin selection 和找零的問題。不管是哪種模型，你的交易追蹤系統都必須建模為完整的狀態機，覆蓋每一種可能的狀態和轉換路徑。

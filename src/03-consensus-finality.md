# 3. 共識、最終性與重組

## 3.1 共識模型

共識機制是區塊鏈的心臟——它決定了一群互不信任的節點如何對「哪些交易是有效的、以什麼順序執行」達成一致意見。不同的共識機制在安全性、去中心化程度、最終性速度和能源效率之間做出不同的取捨。作為區塊鏈系統工程師，你不需要發明新的共識機制，但必須深刻理解你所使用的鏈的共識特性，因為這直接影響你的系統在「何時可以信任一筆交易已經完成」這個問題上的設計。

### Nakamoto PoW: 機率最終性

Nakamoto Consensus（中本聰共識）是 Bitcoin 採用的共識機制，也是歷史上第一個成功解決拜占庭將軍問題的去中心化方案。其核心思想是「最長鏈規則」——所有節點都選擇累積工作量（Proof of Work）最多的鏈作為正確的鏈。礦工通過消耗計算資源來「挖礦」，找到符合難度要求的 hash 值後就可以產生新區塊。

重組風險隨確認數下降，但永遠不會降到零——這就是「機率最終性」（Probabilistic Finality）的含義。一筆交易被打包進區塊後，後面每多一個區塊確認，被重組的機率就指數級下降。Bitcoin 社群傳統上認為 6 個確認（約 60 分鐘）足夠安全，因為此時攻擊者需要控制超過全網 50% 的算力才有非微不足道的機率成功重組。

```text
確認數與安全性 (假設攻擊者控制 10% 算力):

  確認數    被重組機率
  ────────────────────────
  1 確認    ~0.2%
  2 確認    ~0.04%
  3 確認    ~0.008%
  6 確認    ~0.00003%   <── Bitcoin 傳統門檻
  12 確認   ~0.000000001%

  注意: 如果攻擊者控制更多算力，所需確認數要相應增加
```

**工程實務影響：** 在構建接受 Bitcoin 支付的系統時，你必須決定每種場景需要多少個確認數。一杯咖啡的支付也許 0-confirmation 就可以接受（輔以其他風控手段），但一筆 100 BTC 的 OTC 交易可能需要 6 個甚至更多確認。不同確認數對應不同的等待時間（每個確認約 10 分鐘），這直接影響用戶體驗。

```python
# 偽碼: 根據金額決定確認數
def required_confirmations(amount_btc: float) -> int:
    if amount_btc < 0.01:
        return 1     # 小額，快速確認
    elif amount_btc < 1.0:
        return 3     # 中等金額
    elif amount_btc < 10.0:
        return 6     # 大額，標準門檻
    else:
        return 12    # 超大額，最高安全
```

### PoS + BFT: 經濟懲罰 + 檢查點

Proof of Stake（權益證明）搭配 BFT（Byzantine Fault Tolerance）變種是目前大多數新一代區塊鏈採用的共識機制。Ethereum 在 2022 年 9 月完成 The Merge，從 PoW 轉換到 PoS。在 PoS 中，驗證者質押（stake）原生代幣作為保證金，如果他們試圖作弊（例如同時為兩個衝突的區塊簽名），他們的質押會被削減（slashing）。

Ethereum 的 PoS 共識（Casper FFG + LMD GHOST）將時間劃分為 slot（12 秒）和 epoch（32 個 slot = 6.4 分鐘）。每個 epoch 結束時，如果有超過 2/3 的驗證者對該 epoch 的檢查點投票，該檢查點就被「justified」；如果連續兩個 epoch 的檢查點都被 justified，較早的那個就被「finalized」。Finalized 的區塊在協議層面是不可逆的——要回滾它需要至少 1/3 的驗證者被 slashed（在 Ethereum 上意味著數十億美元的經濟損失）。

```text
Ethereum PoS Finality 流程:

  Epoch N-1          Epoch N            Epoch N+1
  [32 slots]         [32 slots]         [32 slots]
  ─────────── ──────────────── ────────────────
       │                │                │
  Checkpoint A     Checkpoint B    Checkpoint C
       │                │                │
       └── justified ──>│                │
                        └── justified ──>│
                        │                │
                   A finalized!    B finalized!
                   (不可逆)

  從交易被打包到 finalized ≈ 12-15 分鐘
```

**其他 PoS + BFT 的實作：**

- **Tendermint（Cosmos 生態）：** 採用即時最終性——一旦區塊被 2/3 的驗證者簽名確認，就立即 finalized，不存在分叉的可能。延遲通常在 6-7 秒。代價是如果超過 1/3 的驗證者離線，整條鏈會停止出塊（liveness 犧牲換取 safety）。

- **Tower BFT（Solana）：** 利用 Proof of History 作為時間戳機制，結合類 PBFT 共識。Solana 的 vote 交易佔了全網交易量的很大比例（有時超過 50%），這些 vote 就是驗證者在進行共識。Finality 通常在 12-15 秒。

- **Narwhal + Bullshark（Sui）：** 基於 DAG（有向無環圖）的共識，先做資料傳播（Narwhal），再做排序（Bullshark）。對不涉及共享物件的「簡單交易」可以跳過共識直接確認，延遲低於 500ms。

### Rollup: L2 本地排序 + L1 結算最終性

Rollup 的共識模型與 L1 根本不同。Rollup 不需要自己的去中心化共識——它依賴 L1 的共識作為最終的安全保障。L2 的 Sequencer（排序器）只是決定交易的執行順序，然後把結果（以及證明）提交到 L1。

這產生了多層級的最終性，工程上需要非常小心地區分：

```text
Rollup 最終性層級:

  ┌───────────────────────────────────────────────────────────────┐
  │ Level 0: Sequencer Confirmation (即時)                        │
  │   Sequencer 回傳「交易已收到並排序」                            │
  │   信任假設: 信任 Sequencer 不會惡意重排或丟棄                   │
  │   風險: Sequencer 可能當機、審查交易、MEV 重排                  │
  ├───────────────────────────────────────────────────────────────┤
  │ Level 1: L1 Batch Submission (數分鐘到數小時)                  │
  │   交易批次被提交到 L1 的合約中                                  │
  │   信任假設: 資料已在 L1 上可用，任何人可驗證                    │
  │   風險: 仍未被最終驗證（Optimistic Rollup 的挑戰期尚未開始）    │
  ├───────────────────────────────────────────────────────────────┤
  │ Level 2: L1 Finality (Optimistic: 7天 / ZK: 數小時)           │
  │   Optimistic: 7 天挑戰期過後無人提出欺詐證明                   │
  │   ZK: 零知識證明被 L1 合約驗證通過                              │
  │   信任假設: L1 的共識安全                                      │
  │   風險: 與 L1 相同（幾乎可忽略）                               │
  └───────────────────────────────────────────────────────────────┘
```

**工程決策：** 大多數 Rollup 上的應用在 Level 0（Sequencer Confirmation）就視為交易完成。這對於 DEX 交易、遊戲互動等場景是合理的——Sequencer 惡意行為的機率很低，且即使發生，用戶可以通過 L1 的 escape hatch 機制取回資金。但對於大額跨鏈轉帳、交易所入金等高風險場景，應該等到 Level 1 甚至 Level 2。

## 3.2 最終性層級

最終性（Finality）是區塊鏈工程中最容易被誤解的概念之一。很多開發者簡單地認為「交易被打包進區塊 = 交易完成」，但事實遠非如此。不同鏈、不同場景下的「完成」有著截然不同的含義和安全保障。

### Soft Finality（軟最終性）

**通常幾秒到幾分鐘，可能被重組。** Soft Finality 是指交易已經被打包進區塊，但該區塊尚未積累足夠的確認或通過最終性檢查點。在這個階段，區塊有可能因為分叉競爭而被重組——你的交易可能從主鏈上消失。

Soft Finality 適用於低風險場景：查看 NFT 元資料、顯示交易歷史、更新 UI 狀態等。在這些場景中，即使交易最終被重組，也不會造成資金損失。

```text
各鏈 Soft Finality 時間:

  Bitcoin:       ~10 分鐘 (1 個確認)
  Ethereum:      ~12 秒 (1 個 slot)
  Solana:        ~400ms (1 個 slot)
  Polygon PoS:   ~2 秒 (1 個區塊)
  Arbitrum:      即時 (Sequencer 回傳)
  Avalanche:     ~1-2 秒 (Snowball 協議)
```

### Economic Finality（經濟最終性）

**回滾成本高，實務可視為完成。** Economic Finality 是指雖然協議層面理論上仍可能被回滾，但這樣做的經濟成本已經高到不理性的程度。例如，要回滾 Ethereum 的一個 finalized epoch，需要至少 1/3 的驗證者願意被 slashed——在當前質押量下，這意味著超過 100 億美元的經濟損失。理性的攻擊者不會這樣做，因為攻擊成本遠高於可能的收益。

Economic Finality 是大多數業務場景的實際依據。交易所的入金確認、支付閘道的訂單結算、DeFi 協議的清算觸發，通常都在 Economic Finality 階段就執行。

**如何評估 Economic Finality 的安全性？** 核心公式是：

```text
安全條件: 攻擊成本 > 攻擊收益

Bitcoin PoW:
  攻擊成本 = 控制 51% 算力的硬體 + 電力 + 機會成本
           ≈ 數十億美元 (持續攻擊)
  攻擊收益 = 雙重花費的金額

Ethereum PoS:
  攻擊成本 = 1/3 質押量被 slashed
           ≈ 100+ 億美元
  攻擊收益 = 雙重花費的金額

小型 PoS 鏈:
  攻擊成本 = 1/3 質押量被 slashed
           ≈ 可能只有數百萬美元
  ⚠️ 如果你的業務涉及超過這個金額的交易，安全性不足！
```

### Cryptographic Finality（密碼學最終性）

**協議層不可逆（或需懲罰超過閾值）。** 這是最強的最終性保證——交易一旦被標記為 finalized，在協議規則內就絕對不可能被回滾。Tendermint 共識的即時最終性、Ethereum 的 finalized checkpoint、ZK Rollup 的 proof 被 L1 驗證通過，都屬於 Cryptographic Finality。

```text
最終性強度比較:

  弱 ──────────────────────────────────────────── 強

  Soft         Economic         Cryptographic
  (可能被       (回滾成本         (協議層
   重組)        極高)             不可逆)

  │             │                │
  1 確認        6+ 確認          Finalized
  Sequencer     L1 Batch         ZK Proof
  回傳          Submitted        Verified
```

### 各鏈最終性時間對照

| 鏈 | Soft Finality | Economic Finality | Cryptographic Finality |
|---|---|---|---|
| Bitcoin | ~10 分鐘 | ~60 分鐘 (6 確認) | 無（機率最終性） |
| Ethereum | ~12 秒 | ~6 分鐘 (1 epoch) | ~12 分鐘 (2 epochs) |
| Solana | ~400ms | ~12 秒 (32 slots) | ~12 秒 |
| Cosmos (Tendermint) | ~6 秒 | ~6 秒 | ~6 秒（即時最終性） |
| Arbitrum (Optimistic) | 即時 | 數分鐘 (L1 batch) | ~7 天 (挑戰期) |
| zkSync (ZK Rollup) | 即時 | 數分鐘 (L1 batch) | 數小時 (proof 驗證) |

**工程上的關鍵決策：** 你的系統在哪個最終性層級採取行動？這個決策直接影響用戶體驗和安全性的平衡。以下是常見的業務場景對應：

```text
業務場景 vs 最終性需求:

  場景                        建議最終性層級       原因
  ──────────────────────────────────────────────────────────
  前端 UI 更新               Soft Finality       用戶體驗優先
  DEX swap 確認              Soft Finality       金額通常較小
  交易所入金 (小額)          Economic Finality   平衡速度和安全
  交易所入金 (大額)          Cryptographic        資金安全第一
  跨鏈橋資產釋放             Cryptographic        歷史事故慘痛
  財務結算/對帳               Cryptographic        會計準確性
```

## 3.3 重組（Reorg）工程處理

區塊重組（Reorg）是區塊鏈系統中最危險、也最容易被忽視的場景。Reorg 發生時，原本被認為有效的區塊和交易被替換為另一條分叉鏈上的區塊和交易。你的系統之前基於「已確認」交易做出的所有決策——入金、出金、清算、狀態更新——可能全部需要回滾。

### 為什麼會發生 Reorg

Reorg 的原因有多種：

1. **自然分叉：** 兩個礦工/驗證者幾乎同時產生了合法的區塊，網路短暫分裂。隨著下一個區塊產生，較短的分叉被拋棄。這種 reorg 通常只有 1-2 個區塊深度，在 PoW 鏈上最常見。

2. **網路延遲：** 區塊傳播到全網需要時間。如果某些節點因為網路延遲而暫時落後，它們可能會在收到較長鏈後切換（reorg）。

3. **惡意攻擊：** 攻擊者秘密挖掘一條更長的鏈，然後突然公布，迫使網路重組。目的通常是雙重花費（double spend）——在公開鏈上花費代幣購買商品，然後用秘密鏈替換，使花費交易消失。

4. **客戶端 Bug：** 不同客戶端對同一區塊的有效性判斷不一致，導致部分節點接受而部分節點拒絕某個區塊，最終在分歧解決後發生 reorg。

```text
Block N      Block N+1      Block N+2
   |             |             |
   +------A------+------B------+------C-----> 主鏈
            \
             +------B'-----C'-----------> 分叉鏈(短暫)
```

```text
深度 Reorg 攻擊示例:

  公開鏈:   ...──[100]──[101]──[102]──[103]──[104]
                                                    ^
                                            交易所確認入金
  攻擊者    ...──[100]──[101']──[102']──[103']──[104']──[105']
  秘密鏈:                                                 ^
                                                   攻擊者公布
                                                   網路切換到此鏈
                                                   交易所入金被回滾!
```

### 事件處理採「可回滾模型」

在工程設計上，任何基於鏈上事件觸發的業務邏輯，都必須設計為可回滾的。這意味著你不能在收到一個事件後就立刻執行不可逆的操作（如匯出法幣、發送實體商品、刪除用戶記錄）。

```text
可回滾事件處理架構:

  鏈上事件 ──> 事件監聽器 ──> 事件資料庫 ──> 業務處理器
                   │              │              │
                   │         記錄區塊高度      根據狀態
                   │         和交易 hash       決定行動
                   │              │
                   │         Reorg 偵測器 ──> 標記受影響事件
                   │              │              │
                   │              └──────────> 回滾業務操作
                   │
                   └── 訂閱 newHeads
                       比對 parentHash
                       偵測 reorg
```

**Reorg 偵測的實作方式：** 最可靠的方法是追蹤每個區塊的 parentHash。當你收到一個新區塊時，檢查它的 parentHash 是否等於你記錄的前一個區塊的 hash。如果不匹配，就發生了 reorg。你需要向前回溯，找到公共祖先區塊，然後重新處理從公共祖先之後的所有區塊。

```python
# 偽碼: Reorg 偵測
class ReorgDetector:
    def __init__(self):
        self.block_cache = {}  # block_number -> block_hash

    def process_block(self, block):
        expected_parent = self.block_cache.get(block.number - 1)

        if expected_parent and expected_parent != block.parent_hash:
            # 偵測到 Reorg!
            reorg_depth = self.find_common_ancestor(block)
            self.handle_reorg(reorg_depth)

        self.block_cache[block.number] = block.hash

    def find_common_ancestor(self, block):
        depth = 0
        current = block
        while current.parent_hash != self.block_cache.get(current.number - 1):
            depth += 1
            current = self.rpc.get_block(current.parent_hash)
        return depth

    def handle_reorg(self, depth):
        # 1. 找出受影響的事件
        # 2. 標記這些事件為 "reorged"
        # 3. 觸發業務回滾
        # 4. 重新處理新鏈上的區塊
        alert(f"Reorg detected! Depth: {depth}")
```

### 入帳分級

入帳分級是處理最終性風險的核心機制。每筆交易經歷三個狀態：

- **`pending`**: 交易已被偵測到（在 mempool 中或被打包進 1 個區塊），但尚未達到安全確認數。系統可以顯示「處理中」，但不能基於此執行任何業務操作。

- **`confirmed(k)`**: 交易已被 k 個區塊確認。k 的值取決於鏈和金額。在此狀態下，系統可以執行低風險的業務操作（如更新顯示餘額），但高風險操作（如允許提現）仍應等待。

- **`finalized`**: 交易已達到鏈的最終性保證。在此狀態下，系統可以執行所有業務操作，包括不可逆的操作。

```text
入帳狀態機:

  ┌─────────┐    k 個區塊確認    ┌──────────────┐    Finalized    ┌───────────┐
  │ pending  │ ────────────────> │ confirmed(k) │ ─────────────> │ finalized │
  └─────────┘                   └──────────────┘                └───────────┘
       │                              │
       │ Reorg                        │ Reorg (罕見但可能)
       ▼                              ▼
  ┌─────────┐                   ┌──────────────┐
  │ dropped │                   │  rolled_back │
  └─────────┘                   └──────────────┘
```

### 針對大額交易提高確認數

這不只是「等久一點」那麼簡單。提高確認數的策略需要考慮以下因素：

1. **確認數的階梯式設計：** 根據交易金額設定不同的確認數門檻。小額交易 1-2 個確認即可，中額交易需要 6 個確認，大額交易需要 12 個以上確認或等待 finalized。

2. **動態調整：** 根據當前的鏈上環境動態調整確認數。如果鏈上正在發生 reorg（即使只是淺層的 1-block reorg），自動提高所有交易的確認數門檻。

3. **同一地址的關聯分析：** 如果同一個地址在短時間內送入多筆中等金額的交易，總金額可能超過大額門檻。風控系統需要將這些交易作為整體評估。

```text
確認數策略示例 (Ethereum):

  金額 (ETH)     所需確認數     等待時間
  ──────────────────────────────────────
  < 0.1          1 slot         ~12 秒
  0.1 - 1.0      3 slots        ~36 秒
  1.0 - 10.0     1 epoch        ~6 分鐘
  10.0 - 100.0   2 epochs       ~12 分鐘 (finalized)
  > 100.0        finalized +    ~12 分鐘 + 額外等待
                 人工審核
```

## 3.4 檢查點策略

檢查點策略是將最終性理論轉化為工程實踐的關鍵環節。不同的業務系統有不同的風險承受能力，因此需要針對性的策略設計。

### 交易策略: 依資產風險配置確認數

不同資產的風險等級不同。主流資產（BTC、ETH）的流動性好、市場深度大，被用於雙重花費攻擊的成本較高。但低市值代幣或流動性差的 NFT 可能被攻擊者利用：在一條鏈上出售，在另一條分叉上取消出售。

```text
資產風險分級:

  Tier 1 (低風險): BTC, ETH, USDC, USDT
    確認數: 標準值
    原因: 市值大、流動性好、攻擊成本高

  Tier 2 (中風險): 主流 DeFi 代幣 (UNI, AAVE, LINK)
    確認數: 標準值 × 1.5
    原因: 市值中等、可能被閃電貸操縱

  Tier 3 (高風險): 小市值代幣、新上線代幣
    確認數: 標準值 × 3 或等待 finalized
    原因: 容易被操縱、可能是詐騙代幣

  特殊: NFT
    確認數: finalized
    原因: 不可替代、價值難以評估、Wash Trading 風險
```

### 服務策略: API 對外預設 confirmed，財務結算用 finalized

設計對外 API 時，需要明確定義不同端點使用的最終性層級。一個常見的設計是讓查詢類 API 使用 `confirmed` 狀態（回應更快、用戶體驗更好），而財務結算相關的 API 使用 `finalized` 狀態（安全性優先）。

```text
API 最終性設計:

  GET /api/v1/balance?address=0x...
    回傳: confirmed 餘額 (最新，但可能被 reorg)
    用途: 前端顯示

  GET /api/v1/balance?address=0x...&finality=finalized
    回傳: finalized 餘額 (稍舊，但確定不會變)
    用途: 交易前的餘額驗證

  POST /api/v1/settlement
    要求: 所有輸入交易必須是 finalized 狀態
    原因: 結算是不可逆操作
```

```javascript
// 偽碼: API 最終性中間件
function finalityMiddleware(req, res, next) {
  const finality = req.query.finality || 'confirmed';

  switch (finality) {
    case 'latest':
      // 最新區塊，可能被 reorg (最快)
      req.blockTag = 'latest';
      break;
    case 'confirmed':
      // 已確認但未 finalized (預設)
      req.blockTag = 'safe';  // Ethereum 的 safe tag
      break;
    case 'finalized':
      // 已 finalized (最安全)
      req.blockTag = 'finalized';
      break;
    default:
      return res.status(400).json({ error: 'Invalid finality level' });
  }

  next();
}
```

### 風控策略: 同一地址高頻提現套用延遲機制

風控策略是最終性管理的最後一道防線。即使交易已經 finalized，如果風控系統偵測到異常模式，仍然應該延遲或阻止業務操作。

**常見的異常模式：**

- **高頻提現：** 同一地址在短時間內發起多筆提現，可能是私鑰被盜後的快速轉移。
- **新地址大額入金後立即提現：** 可能是雙重花費攻擊的前奏——攻擊者先入金、快速提現、然後 reorg 取消入金。
- **跨鏈閃電操作：** 在多條鏈上同時進行入金/提現/swap 的複雜操作，可能是套利攻擊或跨鏈 MEV。

```text
風控規則示例:

  Rule 1: 單地址高頻提現
    條件: 同一地址在 1 小時內提現次數 > 5
    動作: 後續提現自動延遲 30 分鐘 + 人工審核

  Rule 2: 新地址快速提現
    條件: 地址首次入金後 < 24 小時即提現
    動作: 提現需等待 finalized + 額外 6 小時冷卻期

  Rule 3: 大額入金後全額提現
    條件: 入金 > $10,000 且提現金額 > 入金的 90%
    動作: 強制人工審核

  Rule 4: Reorg 期間凍結
    條件: 偵測到任何深度 > 1 的 reorg
    動作: 暫停所有提現，等待鏈穩定後恢復
```

## 3.5 跨鏈場景的最終性挑戰

跨鏈操作將最終性問題的複雜度提升了一個數量級。你不只需要確認源鏈上的交易已經 finalized，還需要確認目標鏈上的操作也已完成。兩條鏈有不同的最終性時間、不同的 reorg 機率、不同的安全假設——這些差異的組合使得跨鏈系統的設計極為棘手。

```text
跨鏈最終性時間線:

  源鏈 (Ethereum)                     目標鏈 (Arbitrum)
  ─────────────────────────────────   ──────────────────────────
  [交易送出]
  │ ~12 秒
  [Soft Finality]
  │ ~12 分鐘
  [Finalized]
  │                                   [橋合約偵測到 finalized 事件]
  │                                   │ ~數分鐘
  │                                   [目標鏈釋放資產]
  │                                   │ ~即時 (Sequencer)
  │                                   [Soft Finality]
  │                                   │ ~7 天 (如需等待 L2 finality)
  │                                   [Cryptographic Finality]

  總時間: 12 分鐘 (最低) 到 7 天 (最高安全)
```

**最佳實踐：**

1. **源鏈等待 finalized 再釋放目標鏈資產。** 不要為了速度而在 Soft Finality 階段就釋放——Wormhole、Ronin Bridge 的事故都與不充分的源鏈驗證有關。

2. **目標鏈設置速率限制。** 即使源鏈驗證通過，也應該對單位時間內跨鏈轉移的金額設置上限。這樣即使橋被攻破，損失也在可控範圍內。

3. **實施時間延遲提款。** 大額跨鏈轉移應該有冷卻期，給監控系統時間來偵測和反應。

## 3.6 MEV 與最終性的交互影響

MEV（Maximal Extractable Value，最大可提取價值）是指礦工/驗證者/排序器通過控制交易排序而獲得的額外利潤。MEV 與最終性有著密切的關係：在交易從 pending 到 finalized 的過程中，MEV 搜索者有動機嘗試重新排序、插入或移除交易。

```text
MEV 影響最終性的方式:

  1. Front-running (搶跑)
     看到 mempool 中的大額 swap 交易
     在它前面插入自己的 swap
     在 Soft Finality 階段就能獲利

  2. Sandwich Attack (三明治攻擊)
     在目標交易前後各插入一筆交易
     利用目標交易造成的價格滑點獲利

  3. Time-bandit Attack (時間強盜攻擊)
     如果重組的獲利 > 重組的成本
     礦工有經濟動機去嘗試 reorg
     這直接威脅了 Economic Finality 的假設!

  防禦:
  - 使用 Flashbots 等私有交易池 (不進公開 mempool)
  - 設置合理的 slippage tolerance
  - 監控 mempool 中的可疑交易模式
```

**Time-bandit Attack** 是 MEV 與 reorg 交集中最令人擔憂的場景。如果某個區塊包含一個極其有利可圖的 MEV 機會（例如大額清算），礦工可能會試圖重組該區塊，將 MEV 收入據為己有。這意味著 Economic Finality 的安全性不只取決於算力/質押量，還取決於區塊中的 MEV 價值。如果一個區塊的 MEV 價值超過了重組的成本，理性的攻擊者就有動機去嘗試 reorg。

## 白話總結

「打包進區塊」不代表 100% 定案。工程上要把「可回滾」當預設，而不是例外。這是區塊鏈系統開發中最反直覺、也最重要的心智模型轉變。在傳統後端開發中，一旦資料寫入資料庫並 commit，你可以認為它就是確定的。但在區塊鏈上，交易被打包進區塊只是「暫時有效」——它隨時可能因為區塊重組而消失。

不同的鏈有不同的最終性模型。Bitcoin 永遠是機率最終性，6 個確認只是讓被重組的機率低到「可接受」的程度；Ethereum 有明確的 finalized 狀態，大約 12 分鐘後交易就真正不可逆了；Solana 和 Cosmos 等鏈有接近即時的最終性，但前者的安全保障較弱。作為工程師，你需要知道每條鏈的最終性時間表，並據此設計你的入帳策略。

入帳分級（pending / confirmed / finalized）是處理最終性問題的標準工程範式。不要把所有交易都當成「已確認」或「未確認」的二元狀態，而是要設計一個多階段的狀態機，讓不同風險等級的業務操作在不同的最終性階段被觸發。小額入金可以在 confirmed 就讓用戶看到餘額更新，但大額提現必須等到 finalized 才能放行。風控系統則是最後一道防線，即使交易已經 finalized，異常的行為模式仍然應該觸發延遲或人工審核。記住：在區塊鏈上，過度謹慎的代價只是「慢一點」，但不夠謹慎的代價可能是「錢沒了」。

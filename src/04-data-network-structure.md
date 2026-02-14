# 4. 網路、資料與節點結構

## 4.1 節點角色

區塊鏈網路中的節點並非同質，不同角色承擔不同的驗證深度與資料儲存責任。理解每種節點的成本與能力邊界，是設計高可用鏈上基礎設施的第一步。

### Full Node

Full Node 是區塊鏈網路中最常見也最重要的角色。它會下載並驗證自創世區塊以來的每一個區塊與交易，維護當前最新的世界狀態（state）。當一筆新交易或新區塊被收到時，Full Node 會獨立執行所有驗證規則——包括簽名驗證、Gas 計算、狀態轉換——而非單純信任其他節點的結論。

在 Ethereum 上，一個 Full Node（如 Geth 或 Nethermind）通常需要 1-2TB 的 SSD 儲存空間與 16GB 以上的 RAM。它會保留最近 128 個區塊的完整狀態，但不會保留更早期的歷史狀態。這意味著你可以查詢當前餘額，但無法查詢「三個月前某地址的餘額」——那是 Archive Node 的工作。

**實務考量**：對於大多數 DApp 後端和交易系統，Full Node 已經足夠。但如果你的服務需要頻繁查詢歷史狀態（例如鏈上數據分析平台），則必須考慮 Archive Node。

### Archive Node

Archive Node 在 Full Node 的基礎上，額外保留了每一個區塊高度的完整世界狀態快照。這使得你可以在任意歷史區塊上執行 `eth_call`，查詢任意過去時間點的合約狀態或帳戶餘額。

代價是巨大的儲存需求——以 Ethereum Mainnet 為例，一個 Archive Node 的儲存量可達 12TB 以上，且持續增長。運行成本高昂，通常只有鏈上數據公司（如 Etherscan、Dune Analytics）、大型交易所和機構級量化團隊才會自行維護。

```text
┌─────────────────────────────────────────────────┐
│                 Archive Node                     │
│  ┌──────────────────────────────────────────┐   │
│  │ Block N 完整狀態 (State Trie Snapshot)    │   │
│  │ Block N-1 完整狀態                        │   │
│  │ Block N-2 完整狀態                        │   │
│  │ ...                                       │   │
│  │ Block 0 (Genesis) 完整狀態                │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  可查詢: eth_call at any block height            │
│  儲存量: 12+ TB (Ethereum Mainnet)              │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                  Full Node                       │
│  ┌──────────────────────────────────────────┐   │
│  │ Block N 完整狀態 (最新)                   │   │
│  │ Block N-1 ~ N-128 (近期剪枝範圍)         │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  可查詢: 僅最近 128 個區塊的狀態               │
│  儲存量: 1-2 TB                                 │
└─────────────────────────────────────────────────┘
```

### Validator / Sequencer

在 Proof of Stake 網路中，Validator 負責提議（propose）新區塊並對其他區塊進行投票（attest）。Validator 必須質押一定數量的原生代幣（如 Ethereum 要求 32 ETH），並持續在線運行。離線或惡意行為會導致 slashing（削減質押金）。

在 Layer 2 的 Rollup 架構中，Sequencer 扮演類似角色——它負責收集使用者交易、排定執行順序、產生 L2 區塊，並將壓縮後的交易資料提交到 L1。目前大多數 Rollup（如 Optimism、Arbitrum、Base）仍使用中心化 Sequencer，這帶來了審查抗性和活性（liveness）的擔憂，但也提供了低延遲的使用者體驗。

**案例**：2023 年 Arbitrum Sequencer 曾因硬體故障離線約 1 小時，導致所有 L2 交易暫停。這凸顯了中心化 Sequencer 的單點故障風險，也推動了去中心化 Sequencer 方案（如 Espresso、Astria）的研發。

### Light Client

Light Client 不下載完整區塊，僅下載區塊頭（block header）。它透過 Merkle Proof 來驗證特定交易或狀態是否被包含在某個區塊中，而無需信任任何特定的全節點。

Light Client 的資源需求極低（可在手機或瀏覽器中運行），適合用於：
- 行動端錢包驗證交易狀態
- 跨鏈橋驗證來源鏈的區塊合法性
- IoT 設備上的輕量級鏈上驗證

Ethereum 的 Sync Committee 機制允許 Light Client 僅追蹤一組預選驗證者的簽名即可驗證區塊頭的合法性，大幅降低了同步成本。

---

## 4.2 P2P 與 Mempool

### Mempool 的運作機制

當使用者發送一筆交易時，它不會直接進入區塊，而是先被送到節點的 mempool（memory pool）——一個存放待處理交易的暫存區。節點之間透過 P2P gossip 協議互相傳播 mempool 中的交易，使得全網節點最終都能看到這筆交易。

Mempool 本質上是無序的——不同節點看到交易的時間不同，本地 mempool 的內容也不完全一致。出塊者（miner 或 validator）從自己的 mempool 中選擇交易打包進區塊，選擇標準通常是 Gas Price 從高到低排序，以最大化自身收益。

```text
交易廣播與 Mempool 流程：

 User A           User B           User C
   |                |                |
   v                v                v
 Node 1          Node 2           Node 3
   |                |                |
   +----gossip------+----gossip------+
   |                |                |
   v                v                v
┌──────────┐  ┌──────────┐   ┌──────────┐
│ Mempool  │  │ Mempool  │   │ Mempool  │
│ (本地)    │  │ (本地)    │   │ (本地)    │
│          │  │          │   │          │
│ Tx1: 50  │  │ Tx1: 50  │   │ Tx2: 30  │
│ Tx2: 30  │  │ Tx3: 80  │   │ Tx3: 80  │
│ Tx3: 80  │  │ Tx2: 30  │   │ Tx1: 50  │
└──────────┘  └──────────┘   └──────────┘
   (各節點 mempool 內容可能不同步)

         出塊者選擇 Gas 最高的交易優先打包
                    |
                    v
         ┌──────────────────┐
         │ Block N+1        │
         │ Tx3 (80 gwei)    │
         │ Tx1 (50 gwei)    │
         │ Tx2 (30 gwei)    │
         └──────────────────┘
```

### 費率市場

EIP-1559 引入的費率市場將 Gas 費拆分為 base fee 和 priority fee。Base fee 由協議根據上一個區塊的填充率動態調整——如果上一個區塊超過目標容量（50%），base fee 上升；反之下降。Priority fee 則是使用者給出塊者的「小費」，用於激勵出塊者優先打包。

這個設計的工程意義在於：你的交易系統不能只設定一個固定 Gas Price，而必須即時追蹤 base fee 的變化並動態調整出價策略。過低的出價會導致交易長時間卡在 mempool；過高則浪費成本。

**常見陷阱**：在網路極度擁堵時（如 NFT 搶購），base fee 可能在幾個區塊內暴漲數十倍。如果你的系統沒有設定 `maxFeePerGas` 的上限，可能會支付天價 Gas Fee。務必在 policy engine 中設定 Gas 費的硬上限。

### 私有交易通道

公開的 mempool 是透明的，任何人都可以觀察待處理的交易。這催生了 MEV（Maximal Extractable Value）——搜尋者（searcher）觀察 mempool 中的大額交易，搶先提交更高 Gas 的同類交易以獲利（front-running）。

為了對抗 MEV，出現了私有交易通道的概念。例如 Flashbots Protect 允許使用者直接將交易送給 block builder，跳過公開 mempool，避免被搶跑。在 Ethereum 的 PBS（Proposer-Builder Separation）架構下，builder 從搜尋者和使用者手中收集交易，組裝成最優區塊，再競標給 proposer。

```text
公開 Mempool 路徑（有 MEV 風險）：
  User --> Public Mempool --> Searcher 觀察 --> Front-run
                          --> Validator 打包

私有交易路徑（降低 MEV 風險）：
  User --> Flashbots Protect --> Builder --> Validator
           (跳過公開 mempool)
```

**最佳實踐**：對於高價值交易（大額 swap、清算等），務必使用私有交易通道。對於一般性交易，公開 mempool 通常足夠。

---

## 4.3 狀態資料結構

區塊鏈的核心能力之一是「可驗證的狀態」——任何人都可以獨立驗證某個帳戶的餘額或合約的狀態是否正確，而無需信任任何第三方。這依賴於精心設計的密碼學資料結構。

### Merkle Tree

最基本的結構是 Merkle Tree（默克爾樹）。它是一棵二元雜湊樹：葉節點是原始資料的雜湊值，每個內部節點是其兩個子節點雜湊值的雜湊。樹根（Merkle Root）是整棵樹的「指紋」——任何葉節點的變更都會導致根雜湊完全改變。

Merkle Tree 的核心價值是 **包含性證明（Inclusion Proof）**：要證明某筆交易被包含在區塊中，只需提供從該交易葉節點到根的路徑上的兄弟節點雜湊值（稱為 Merkle Path），而不需要提供整棵樹。驗證者可以用 O(log N) 的雜湊計算確認其正確性。

```text
Merkle Tree 結構與 Inclusion Proof：

             Root Hash (存在區塊頭)
            /           \
         H(AB)          H(CD)
        /    \          /    \
     H(A)   H(B)    H(C)   H(D)    <-- 葉節點 = 交易雜湊
      |       |       |       |
     TxA    TxB     TxC    TxD

要證明 TxC 存在於此區塊：
  提供: H(D), H(AB)
  驗證: H(CD) = hash(H(C), H(D))
        Root  = hash(H(AB), H(CD))  ✓

  Proof 大小: O(log N)，N = 交易數量
  4 筆交易只需 2 個雜湊 = 64 bytes
```

### Patricia Trie (MPT)

Ethereum 使用的是 Modified Merkle Patricia Trie（MPT），一種結合了 Patricia Trie（前綴壓縮字典樹）與 Merkle Tree 的混合結構。MPT 以帳戶地址為 key、帳戶狀態為 value，形成一個可驗證的鍵值存儲。

MPT 的設計使得 Ethereum 可以在區塊頭中存放三棵 trie 的根雜湊：State Trie Root（所有帳戶的狀態）、Transaction Trie Root（區塊中的交易）、Receipt Trie Root（交易執行結果）。Light Client 可以透過這些根雜湊配合 Merkle Proof 驗證任何狀態。

然而，MPT 在工程上有顯著的效能問題。每次狀態更新都需要重新計算從葉到根的所有雜湊值，導致大量的磁碟隨機讀寫。Ethereum 社群一直在研究替代方案——例如 Verkle Tree，它使用向量承諾（vector commitment）來大幅縮小 proof 大小。

### Sparse Merkle Tree (SMT)

Sparse Merkle Tree 是一棵固定深度的完全二元樹，其中大部分葉節點為空（預設值）。它的優勢是可以高效地證明某個 key **不存在**（non-inclusion proof），這是普通 Merkle Tree 做不到的。

SMT 廣泛用於 zk-Rollup 和隱私協議中。例如在 zkSync 中，SMT 用來維護 L2 的帳戶狀態樹，因為 ZK 電路需要固定大小的資料結構來生成證明。

```text
各資料結構比較：

┌──────────────────┬────────────┬──────────────┬─────────────────┐
│                  │ Merkle Tree│ Patricia Trie│ Sparse Merkle   │
├──────────────────┼────────────┼──────────────┼─────────────────┤
│ Inclusion Proof  │     ✓      │      ✓       │       ✓         │
│ Non-Inclusion    │     ✗      │      ✓       │       ✓         │
│ Key-Value 查詢   │     ✗      │      ✓       │       ✓         │
│ Proof 大小       │  O(log N)  │  O(key_len)  │   O(depth)      │
│ ZK 友好          │     △      │      ✗       │       ✓         │
│ 使用場景         │ BTC 交易   │ ETH 狀態     │ zk-Rollup       │
└──────────────────┴────────────┴──────────────┴─────────────────┘
```

---

## 4.4 企業級節點拓撲

在生產環境中，僅運行一個節點是完全不可接受的。企業級系統需要多層次的節點拓撲來確保高可用性、低延遲和故障隔離。以下是一個典型的生產架構：

```text
                   ┌──────────────┐
                   │ Load Balancer│
                   │ (L7 / gRPC) │
                   └──────┬───────┘
                          │
     ┌────────────────────┼────────────────────┐
     v                    v                    v
┌───────────┐       ┌───────────┐       ┌───────────┐
│ RPC Node A│       │ RPC Node B│       │ RPC Node C│
│ (Read)    │       │ (Read)    │       │ (Write)   │
└─────┬─────┘       └─────┬─────┘       └─────┬─────┘
      │                   │                   │
      v                   v                   v
 ┌─────────┐         ┌─────────┐         ┌─────────┐
 │Indexer A│         │Indexer B│         │Indexer C│
 │(Events) │         │(Blocks) │         │(Txns)   │
 └────┬────┘         └────┬────┘         └────┬────┘
      └──────────────┬────┴────┬──────────────┘
                     v         v
               ┌────────────────────┐
               │ Data Lake / SIEM   │
               │ (ClickHouse / ELK) │
               └─────────┬──────────┘
                          │
              ┌───────────┼───────────┐
              v           v           v
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │Dashboard │ │ Alerting │ │ Audit    │
        │(Grafana) │ │(PagerD.) │ │ Trail   │
        └──────────┘ └──────────┘ └──────────┘
```

### 讀寫分離架構

在高流量環境中，讀取請求（查餘額、查合約狀態、查歷史交易）的量通常是寫入請求（發送交易）的 100 倍以上。因此，將讀寫流量分離到不同的 RPC 節點是基本的架構原則。

讀取節點可以水平擴展，並且可以容忍短暫的區塊高度延遲（例如落後 1-2 個區塊）。寫入節點則需要保持與網路的最低延遲連接，以確保交易盡快被傳播。

### 多供應商策略

不要將所有流量都指向單一的 RPC 供應商（如 Alchemy、Infura、QuickNode）。2022 年和 2023 年都曾發生過主流 RPC 供應商的大面積故障事件。推薦的策略是：

```text
流量分配策略：

  主要供應商 (60%)   ──→  Alchemy / Infura
  備援供應商 (30%)   ──→  QuickNode / Ankr
  自建節點   (10%)   ──→  自行維護的 Full Node

  Fallback 機制：
  1. 主要供應商 timeout > 2s → 切換備援
  2. 備援供應商 timeout > 2s → 切換自建
  3. 所有供應商失敗 → 觸發告警 + 暫停寫入操作
```

### Indexer 層的設計

原生的 RPC 介面效能不足以支撐複雜查詢（例如「列出某地址過去 30 天的所有 ERC-20 轉帳」）。Indexer 層負責將鏈上資料結構化存入傳統資料庫（PostgreSQL、ClickHouse），並提供高效的查詢 API。

常見的 Indexer 方案：
- **The Graph**：去中心化索引協議，適合公開資料
- **Goldsky / Envio**：托管式索引，低延遲
- **自建 Indexer**：完全控制，但維護成本高。通常使用 `eth_subscribe` 或 `eth_getLogs` 監聽事件，解析後寫入資料庫

**常見陷阱**：Indexer 必須處理 **chain reorganization（reorg）**。當區塊鏈發生 reorg 時，已經索引的資料可能變得無效。你的 Indexer 必須有回滾機制——監測到 reorg 時，刪除被撤銷區塊的資料，重新索引新的規範鏈。

---

## 4.5 實務要點

### 不依賴單一 RPC 廠商

如前所述，RPC 廠商是中心化的服務提供商，有著非零的故障概率。即使是最大的供應商，也會因為底層雲端基礎設施（AWS、GCP）的故障而中斷服務。你的系統應該實作 circuit breaker 模式——當主要 RPC 持續報錯時，自動切換到備援。

```python
# Pseudocode: RPC Failover with Circuit Breaker
class RPCManager:
    def __init__(self):
        self.providers = [
            {"url": "https://eth-mainnet.alchemy.com/v2/KEY", "weight": 60},
            {"url": "https://mainnet.infura.io/v3/KEY",       "weight": 30},
            {"url": "http://localhost:8545",                    "weight": 10},
        ]
        self.circuit_breaker = {}  # provider -> failure_count

    def call(self, method, params):
        for provider in self.get_healthy_providers():
            try:
                result = rpc_call(provider["url"], method, params)
                self.circuit_breaker[provider["url"]] = 0
                return result
            except TimeoutError:
                self.circuit_breaker[provider["url"]] += 1
                if self.circuit_breaker[provider["url"]] > 5:
                    self.mark_unhealthy(provider)
                continue
        raise AllProvidersDown("所有 RPC 供應商不可用")
```

### 讀寫流量分離

對於寫入交易，延遲至關重要——你希望交易盡快被廣播到 mempool。使用與出塊者地理位置接近的節點，或直接與 builder 建立連接。

對於讀取操作，吞吐量更重要。可以使用 CDN 或快取層（Redis）來緩存常見查詢結果（如代幣價格、帳戶餘額），設定適當的 TTL（例如每 12 秒——一個區塊時間——過期一次）。

### 區塊高度一致性監控

當你使用多個 RPC 節點時，它們可能處在不同的區塊高度。如果一個請求讀取了 Node A（block 1000）的狀態，緊接著的另一個請求被路由到 Node B（block 998），使用者可能會看到「餘額倒退」的詭異現象。

解法是持續監控所有節點的區塊高度，並在 Load Balancer 層過濾掉落後過多的節點：

```text
區塊高度監控：

  Node A: block 19,234,567  ✓ (最新)
  Node B: block 19,234,566  ✓ (落後 1 塊，可接受)
  Node C: block 19,234,560  ✗ (落後 7 塊，暫時移出)

  閾值設定：
  - 讀取請求: 容忍落後 ≤ 3 塊
  - 寫入請求: 僅使用最新區塊的節點
  - 落後 > 10 塊: 觸發告警
```

### 延遲尖峰與 Fork 告警

RPC 延遲的突然上升通常是問題的先兆——可能是節點同步落後、網路擁堵、或供應商基礎設施出問題。建立延遲的 P99 基線，當偏離超過 2 倍時觸發告警。

鏈上 fork（分叉）則是更嚴重的事件。當你的節點報告不同的區塊雜湊時，表示可能發生了 reorg。你的系統應該暫停依賴最近幾個區塊狀態的關鍵操作（如確認入金），等待 fork 解決。

**最佳實踐清單**：
- 監控每個 RPC 供應商的 P50 / P95 / P99 延遲
- 設定區塊高度偏差告警（跨節點差異 > 3 塊）
- 監控 mempool 交易的 pending 時間
- 追蹤 reorg 深度和頻率
- 為關鍵告警設定 PagerDuty / Opsgenie 自動呼叫

---

## 白話總結

節點是你整個區塊鏈系統的地基，地基不穩，上面蓋什麼都會倒。不同類型的節點有不同的用途：Full Node 用來驗證最新狀態，Archive Node 用來查歷史，Validator 用來出塊，Light Client 用來在資源有限的環境做輕量驗證。在生產環境中，你絕對不能只靠一個節點或一家 RPC 供應商——你需要多節點、多供應商、讀寫分離的架構，外加完善的監控和告警。交易進入 mempool 後不是你能控制的，但你可以透過私有交易通道來降低被 MEV 搜尋者狙擊的風險。底層的資料結構（Merkle Tree、Patricia Trie）是讓區塊鏈能「無信任驗證」的數學基礎，理解它們有助於你判斷 proof 驗證的成本與限制。最後，永遠記得處理 chain reorg——你的 Indexer 和確認邏輯必須能回滾，否則在 reorg 發生時會產生錯誤的業務判斷。

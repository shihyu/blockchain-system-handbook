# 15. 術語與快速索引

本章收錄區塊鏈系統工程中最常見的術語，每個術語附帶簡要解釋和工程上的重要提醒。遇到不熟悉的詞彙時，先在這裡查找定義，再回到對應的主章節看完整上下文。術語按照類別分組，方便快速定位。

---

## 核心帳戶與交易模型

- **EOA (Externally Owned Account)**：外部私鑰帳戶，由一對公私鑰控制的基本帳戶類型。EOA 是 Ethereum 上最原始的帳戶形式，用戶直接持有私鑰來簽名和發起交易。EOA 的缺點是沒有內建的多簽、社交恢復或 gas 代付等功能。

- **UTXO (Unspent Transaction Output)**：未花費輸出模型，Bitcoin 等鏈使用的交易模型。每筆交易消耗舊的 UTXO 並產生新的 UTXO，餘額是所有屬於你的 UTXO 的加總。這種模型天然支持並行驗證和資金流向追蹤。

- **EUTXO (Extended UTXO)**：帶資料與腳本條件的 UTXO 擴展模型，由 Cardano 首創。在每個 UTXO 上附加 Datum（資料）和 Validator Script（驗證邏輯），使 UTXO 能承載更複雜的合約狀態，但開發難度顯著高於 Account 模型。

- **AA (Account Abstraction)**：可程式化帳戶，透過 ERC-4337 標準在 Ethereum 上實現。允許用智能合約作為帳戶，支援 gas 代付、批量交易、session key、社交恢復等進階功能，大幅改善使用者體驗。

- **Nonce**：交易序號，用於確保同一帳戶發出的交易按順序執行且不被重播。在 Account 模型中，nonce 是 per-account 的遞增序號；在高並發場景下，nonce 管理是工程上的主要挑戰之一。

- **Gas / Gas Price / Gas Limit**：Gas 是 EVM 計算量的單位，Gas Price 是每單位 Gas 的費用，Gas Limit 是交易願意支付的最大 Gas 量。EIP-1559 引入了 base fee + priority fee 的雙層結構，使 gas 價格預測更可靠。

---

## 密鑰與安全

- **MPC (Multi-Party Computation)**：多方計算簽名，將私鑰分割成多個 shard，分散到不同的計算節點。簽名時各節點協同計算，產生一個標準簽名，但任何單一節點都不擁有完整私鑰。機構級錢包（如 Fireblocks）的核心技術。

- **Multisig**：M-of-N 門檻多簽，需要 N 個簽名者中的 M 個共同簽名才能執行交易。在 Ethereum 上通常用智能合約實現（如 Gnosis Safe），在 Bitcoin 上可以用 Script 或 Taproot 實現。多簽是 DAO 國庫和機構錢包的標準安全措施。

- **HSM (Hardware Security Module)**：硬體安全模組，通過 FIPS 140-2/3 認證的專用硬體設備，用於安全地生成、儲存和使用密鑰。HSM 確保私鑰永遠不會以明文形式離開硬體，即使伺服器被入侵也無法提取密鑰。

- **TSS (Threshold Signature Scheme)**：門檻簽名方案，MPC 的一種具體實現。與鏈上 multisig 不同，TSS 在鏈下完成多方協同簽名，鏈上只看到一個普通簽名，節省 gas 且保護隱私。

- **Seed Phrase / Mnemonic**：助記詞，由 12 或 24 個英文單詞組成的私鑰備份方式（BIP-39 標準）。從助記詞可以確定性地推導出完整的密鑰樹。助記詞的安全保管是個人資產安全的基礎。

- **Social Recovery**：社交恢復機制，用戶預設一組信任的 guardians，當私鑰遺失時，guardians 可以共同授權恢復帳戶控制權。AA 錢包（如 Argent）的常見功能。

---

## 共識與最終性

- **Finality**：最終性，指交易被確認後不可逆轉的保證程度。不同鏈的最終性機制差異很大：Bitcoin 是概率性最終性（隨確認數增加，被推翻的概率指數下降）；Ethereum PoS 有 2 epoch 的確定性最終性；Tendermint-based 鏈通常有即時最終性。

- **Reorg (Chain Reorganization)**：區塊重組，當網路中出現更長/更重的替代鏈時，節點會切換到新鏈，導致已確認的交易被撤銷。Reorg 是跨鏈橋和交易確認系統必須處理的核心風險。

- **Sequencer**：L2 排序器，負責收集使用者交易、排序、執行、並將結果批次提交到 L1。目前大多數 L2（Arbitrum、Optimism、Base）使用中心化的 sequencer，這是一個信任假設和單點故障風險。去中心化 sequencer 是 L2 發展的重要方向。

- **Validator**：驗證者，在 PoS 共識中負責提議和驗證新區塊的節點。Validator 需要質押代幣作為保證金，違規行為會被 slashing（沒收質押）。

- **Slashing**：懲罰機制，當 validator 出現雙重簽名、長時間離線等違規行為時，系統會沒收其部分或全部質押代幣。Slashing 是 PoS 系統維護安全性的經濟激勵機制。

- **Fork (Hard Fork / Soft Fork)**：分叉，區塊鏈協議升級的方式。Hard fork 是不向後相容的升級（舊節點不認新規則），可能導致鏈分裂（如 ETH/ETC）；Soft fork 是向後相容的升級（舊節點仍可驗證新區塊）。

---

## Layer 2 與擴容

- **DA (Data Availability)**：資料可用性，確保任何人都能取得驗證交易所需的完整資料。L2 將交易資料發布到 L1（或專用 DA 層如 Celestia、EigenDA），確保即使 sequencer 離線，用戶仍可從 DA 資料重建狀態並提領資金。

- **Rollup (Optimistic / ZK)**：L2 擴容方案的主流架構。Optimistic Rollup 先假設交易正確，挑戰期內可提出 fraud proof；ZK Rollup 用零知識證明數學上保證交易正確。Optimistic 開發門檻較低但提領時間較長（7 天），ZK 安全性更強但計算成本較高。

- **Fraud Proof**：欺詐證明，Optimistic Rollup 的安全機制。如果 sequencer 提交了錯誤的狀態，任何人都可以在挑戰期內提交 fraud proof 來推翻錯誤並獲得獎勵。

- **Validity Proof (ZK Proof)**：有效性證明，ZK Rollup 的安全機制。每批交易都附帶一個數學證明，驗證所有交易的執行結果是正確的。L1 合約只需驗證這個簡短的證明，而不需重新執行所有交易。

- **Blob (EIP-4844)**：Binary Large Object，Ethereum Dencun 升級引入的新交易類型，專門用於 L2 發布 DA 資料。Blob 資料的存儲成本遠低於 calldata，大幅降低了 L2 的運營成本。

---

## DeFi 與經濟模型

- **MEV (Maximal Extractable Value)**：可提取價值，指區塊生產者或 sequencer 可以通過重排、插入或排除交易來獲取的額外利潤。常見的 MEV 形式包括三明治攻擊（sandwich attack）、套利（arbitrage）和清算搶跑（liquidation frontrunning）。MEV 是 DeFi 用戶面臨的隱性成本。

- **TVL (Total Value Locked)**：總鎖倉價值，衡量一個 DeFi 協議或區塊鏈生態中鎖定的資產總值。TVL 是評估協議規模和市場信心的常用指標，但也可能被操縱（如通過循環借貸虛增）。

- **Oracle**：預言機，將鏈外資料（如價格、天氣、體育結果）安全地餵入鏈上合約。Chainlink 是最主流的去中心化預言機網路。預言機的可靠性直接影響依賴它的所有合約的安全性。

- **Liquidation**：清算，當借貸協議中借款人的抵押品價值降到清算門檻以下時，系統允許清算人買走抵押品來償還債務。清算機制的正確性是借貸協議的安全基礎。

- **Flash Loan**：閃電貸，在一個交易內完成借款和還款，無需抵押品。閃電貸本身是中性工具，但常被用於治理攻擊和價格操縱。

- **AMM (Automated Market Maker)**：自動做市商，使用數學公式（如 x*y=k）而非訂單簿來提供流動性和定價。Uniswap、Curve 是最知名的 AMM 協議。

- **Impermanent Loss**：無常損失，AMM 流動性提供者在代幣價格變動時相對於單純持有代幣的損失。價格偏離越大，無常損失越大。

---

## 合約開發

- **Proxy Pattern**：代理模式，透過將合約邏輯和存儲分離，實現合約的可升級性。主流模式包括 Transparent Proxy（OpenZeppelin）和 UUPS。使用 proxy 時必須特別注意 storage layout 的相容性。

- **Reentrancy**：重入攻擊，合約在外部呼叫完成前被再次呼叫，導致狀態不一致。2016 年 The DAO 事件（損失 $60M）就是重入攻擊。防禦方式包括 checks-effects-interactions 模式和 OpenZeppelin 的 ReentrancyGuard。

- **Timelock**：時間鎖合約，執行敏感操作前強制等待一段時間。Timelock 給予社群審查即將執行的變更的機會，是 DAO 治理和合約升級的標準安全措施。

- **ERC-20 / ERC-721 / ERC-1155**：Ethereum 代幣標準。ERC-20 是同質化代幣（如 USDC、LINK），ERC-721 是非同質化代幣（NFT），ERC-1155 是多代幣標準（一個合約可同時管理多種同質化和非同質化代幣）。

- **ABI (Application Binary Interface)**：應用二進制介面，定義了如何與合約函數交互的編碼規範。前端和後端透過 ABI 來構造和解碼合約呼叫。

- **NatSpec**：Natural Language Specification，Solidity 的文檔註解標準。用 `@notice`、`@param`、`@return` 等標籤為合約函數撰寫人類可讀的說明。

---

## 監控與營運

- **SIEM (Security Information and Event Management)**：安全資訊與事件管理系統，集中收集、分析和留存安全事件日誌。在區塊鏈系統中，SIEM 應同時涵蓋鏈上事件（合約 event）和鏈下事件（API 存取、配置變更）。

- **RPC (Remote Procedure Call)**：遠程過程呼叫，與區塊鏈節點交互的標準介面。常用的 RPC provider 包括 Alchemy、Infura、QuickNode。生產環境應使用多個 RPC provider 做 load balancing 和 failover。

- **Subgraph / Indexer**：鏈上資料索引服務，將合約 event 和交易資料轉換為可查詢的結構化資料庫。The Graph 是最常用的去中心化索引協議，Ponder 和 Envio 是較新的替代方案。

- **Runbook**：操作手冊，記錄常見問題和緊急事件的標準操作流程。每個 P0/P1 告警都應有對應的 Runbook，描述確認問題、定位根因、執行修復的具體步驟。

---

## 跨鏈與橋接

- **Bridge**：跨鏈橋，在不同區塊鏈之間轉移資產和訊息的基礎設施。常見的安全模型包括：信任 committee（如 Wormhole guardians）、optimistic（如 Across）、ZK 證明（如 zkBridge）。跨鏈橋是歷史上損失最大的攻擊面。

- **Wrapped Token**：包裝代幣，將一條鏈上的原生資產在另一條鏈上以 1:1 的 ERC-20 代幣形式表示。例如 WBTC（Wrapped Bitcoin on Ethereum）。Wrapped token 的安全性取決於背後的託管/橋接機制。

- **Canonical Bridge vs Third-Party Bridge**：官方橋與第三方橋。L2 通常有官方橋（安全性繼承 L1，但速度慢），第三方橋（如 Stargate、Across）提供更快的體驗但引入額外信任假設。

---

## 合規與監管

- **AML (Anti-Money Laundering)**：反洗錢，要求金融機構識別和報告可疑交易的法規框架。在加密貨幣領域，AML 合規通常透過鏈上分析工具（如 Chainalysis、Elliptic）來實現。

- **KYT (Know Your Transaction)**：認識你的交易，透過分析鏈上交易歷史和資金來源來評估交易風險。KYT 是 AML 合規的具體技術實現。

- **Proof of Reserves (PoR)**：儲備證明，交易所或託管機構公開證明其持有的鏈上資產足以覆蓋用戶存款。通常透過 Merkle tree 或 ZK proof 實現，FTX 事件後成為業界標準要求。

- **Travel Rule**：旅行規則，要求虛擬資產服務提供商（VASP）在超過一定金額的交易中，傳遞發送方和接收方的身份資訊。來自 FATF 的建議，各國正逐步立法實施。

---

## 快速定位

| 想了解的主題 | 參考章節 |
|---|---|
| 交易流程與生命週期 | 第 6 章 |
| 合約執行與 EVM 機制 | 第 7 章 |
| 跨鏈風險與橋接安全 | 第 8 章 |
| 多簽完整設計與實作 | 第 10 章 |
| 安全事故與防禦策略 | 第 11 章 |
| 參考架構藍圖 | 第 13 章 |
| 上線前總檢查清單 | 第 14 章 |
| UTXO 模型深入解析 | 第 16 章 |

---

## 白話總結

這一章是整本手冊的字典和索引。區塊鏈工程涉及大量的專業術語，有些源自密碼學（如 MPC、TSS），有些源自分散式系統（如 Finality、Reorg），有些源自金融（如 AML、Liquidation），有些則是區塊鏈特有的概念（如 MEV、Gas）。初學者在閱讀其他章節時，遇到不認識的詞彙可以先回來這裡查找定義和簡要說明，了解基本概念後再回到主章節看完整的技術脈絡。

術語列表也按照類別分組（帳戶模型、密鑰安全、共識機制、L2 擴容、DeFi、合約開發、監控營運、跨鏈橋接、合規監管），方便你在研究某個特定領域時快速找到所有相關術語。「快速定位」表格則告訴你每個主題在手冊中的對應章節，當你需要深入了解某個概念時，可以直接跳轉到對應的章節閱讀。建議在開始閱讀整本手冊之前，先快速瀏覽一遍這份術語表，對整體知識地圖有個概念，後續閱讀會更順暢。

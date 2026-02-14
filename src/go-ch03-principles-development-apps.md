# 第3章 區塊鏈原理、發展與應用

本章目標是建立能落地開發的底層心智模型：你要知道鏈為何存在、如何達成一致、資料怎麼驗證、系統如何選型。

## 3.1 區塊鏈基本原理

### 3.1.1 區塊鏈技術為什麼會產生 `P0`

在傳統中心化系統裡，資料正確性來自單一權威（銀行、平台、政府資料庫）。
區塊鏈的核心問題是：
- 如果沒有中心機構，如何讓所有節點相信「同一本帳」？
- 如果人人可發交易，如何防止同一筆資產被重複花費（雙花）？

工程上可把區塊鏈理解為三件事的組合：
1. `資料結構`：用 hash 鏈接區塊，保證歷史難以篡改。
2. `網路協議`：用 P2P 傳播交易與區塊。
3. `共識機制`：決定哪條鏈是全網接受的正確歷史。

要理解區塊鏈為什麼會產生，可以從「拜占庭將軍問題」說起。想像有多個將軍需要協調進攻，但彼此之間只能靠信使溝通，而且有些將軍可能是叛徒。傳統做法是設一個總司令（中心化權威），但如果總司令本身不可信或者倒下了，系統就崩潰了。區塊鏈的方案是：讓所有將軍透過一套數學規則自行達成一致，不需要信任任何單一個體。

從工程實務來看，中心化系統的瓶頸不僅是信任問題，更是單點故障問題。2016 年 Bangladesh Bank 被駭客透過 SWIFT 系統盜走 8100 萬美元，正是因為所有授權都集中在單一節點。區塊鏈透過分散驗證，讓攻擊成本從「攻破一個點」變成「攻破多數節點」，這在密碼學保證下幾乎不可行。

```text
傳統中心化架構：                     區塊鏈去中心化架構：

     ┌─────────┐                    ┌──────┐    ┌──────┐
     │ 中心DB  │                    │Node A│<──>│Node B│
     └────┬────┘                    └──┬───┘    └──┬───┘
    ┌─────┼─────┐                     │            │
    │     │     │                  ┌──┴───┐    ┌──┴───┐
  User  User  User                │Node C│<──>│Node D│
                                  └──────┘    └──────┘
  單點故障 / 單點信任               每個節點持有完整帳本副本
```

真實案例：2008 年金融危機後，人們對銀行系統的信任降到冰點。Satoshi Nakamoto 在 Bitcoin 白皮書中明確寫道：「A purely peer-to-peer version of electronic cash would allow online payments to be sent directly from one party to another without going through a financial institution.」這不只是技術選擇，更是對信任模型的根本重設。

### 3.1.2 什麼是 hash 函數 `P0`

hash 函數把任意長度輸入映射成固定長度輸出，典型特性：
- 不可逆：難以從 hash 反推出原文
- 抗碰撞：難找兩份不同資料得到同 hash
- 雪崩效應：輸入改一點，輸出大幅改變

在區塊鏈中，hash 用於：
- 交易 ID
- 區塊 ID
- 區塊鏈接（前一區塊 hash）
- Merkle Root（交易集合摘要）

hash 函數是區塊鏈最基礎的密碼學工具，理解它的運作方式對後續所有章節都至關重要。以 SHA-256 為例，無論輸入是 1 byte 還是 1 GB，輸出永遠是 32 bytes（256 bits）。這個特性讓我們可以用固定大小的「指紋」來代表任意大小的資料。

雪崩效應是 hash 函數最驚人的特性之一。把 "hello" 的 SHA-256 和 "hello!" 的 SHA-256 對比，兩者完全不同，沒有任何統計相關性。這意味著你無法透過觀察 hash 值的變化來推斷輸入的變化。在區塊鏈中，這保證了只要交易內容被改動一個 bit，整個區塊的 hash 就會完全不同，從而破壞鏈的連續性。

抗碰撞性的實務意義在於：如果兩筆不同的交易可以產生相同的 hash，攻擊者就能用一筆合法交易的 hash 替換成惡意交易。SHA-256 的碰撞空間是 2^256，大約是宇宙中原子數量的平方，在可預見的計算能力下不可能暴力碰撞。

Go 實作要點：
- 使用 `crypto/sha256`
- 輸入要先序列化成穩定格式
- 相同資料必須得到相同 hash

```go
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func main() {
	data := []byte("hello blockchain")
	sum := sha256.Sum256(data)
	hexID := hex.EncodeToString(sum[:])
	fmt.Println(hexID) // 固定產出相同結果
}

// 區塊 hash 計算範例
func HashBlock(prevHash []byte, merkleRoot []byte, timestamp int64, nonce int64) []byte {
	// 用 binary 序列化確保欄位順序固定
	headers := bytes.Join([][]byte{
		prevHash,
		merkleRoot,
		IntToHex(timestamp),
		IntToHex(nonce),
	}, []byte{})
	hash := sha256.Sum256(headers)
	return hash[:]
}
```

常見坑：
- 直接 `fmt.Sprintf` 拼字串做 hash，格式不穩定
- 忘記固定欄位順序導致 hash 不一致
- 在不同平台上使用不同 endianness 序列化整數，導致跨平台 hash 結果不同
- 把 hash 結果當字串比較而非 bytes 比較，浪費效能且可能出現大小寫問題

最佳實踐：
- 永遠使用 binary encoding（big endian）來序列化整數欄位
- 建立一個統一的 `serialize()` 函數，所有需要 hash 的結構都走同一條路
- 為 hash 計算寫單元測試，用已知輸入驗證輸出（regression test）

### 3.1.3 P2P 網絡簡介 `P0`

P2P 是節點對等連線：每個節點同時是 client 與 server。

最小網路流程：
1. 節點發現（bootstrap / DNS / seed）
2. 建立連線（TCP/QUIC）
3. 握手（版本、鏈高度、能力）
4. 訊息傳播（交易、區塊、請求/回應）

```text
Node A <----> Node B <----> Node C
   ^            |             |
   +------------+-------------+
```

P2P 網路是區塊鏈去中心化的基礎設施層。不同於傳統 client-server 模型，P2P 網路中每個節點都平等地參與資料傳播和驗證。Bitcoin 的 P2P 網路設計精巧地解決了幾個核心問題：如何發現新節點、如何高效傳播資料、如何抵禦惡意節點。

節點發現是 P2P 網路的第一步。Bitcoin 使用了多重機制：硬編碼的 seed nodes 作為初始引導，DNS seeds 提供動態節點列表，以及 addr 訊息讓節點彼此交換已知的其他節點地址。一個新節點加入網路時，會先連上幾個 seed nodes，然後通過它們認識更多節點，逐步建立自己的 peer list。

```text
新節點加入流程：

┌─────────┐  1. 連接 seed    ┌───────────┐
│ New Node │ ──────────────> │ Seed Node │
└────┬────┘                  └─────┬─────┘
     │                              │
     │  2. 版本握手                  │
     │ <───────────────────────────> │
     │                              │
     │  3. 請求 addr 列表            │
     │ ────────────────────────────> │
     │                              │
     │  4. 回覆已知節點列表          │
     │ <──────────────────────────── │
     │                              │
     │  5. 連接更多節點              │
     │ ──────> Node B, C, D...      │
     │                              │
     │  6. 同步區塊資料              │
     │ <────── getblocks/inv/block   │
```

訊息傳播採用 gossip protocol：當一個節點收到新交易或區塊時，會通知它所有的 peers。這種「八卦式」傳播雖然會產生冗餘，但保證了資料能快速覆蓋全網。Bitcoin 主網大約 8 秒就能讓一筆交易傳播到全球大部分節點。

Go 實作要點：
- 先做單一消息協議（`version`, `inv`, `getdata`, `block`）
- 每個連線獨立 goroutine
- 設計 message envelope：`type + payload + checksum`

```go
// 消息封裝格式
type Message struct {
	Command  [12]byte // 消息類型，如 "version", "block"
	Length   uint32   // payload 長度
	Checksum [4]byte  // payload 前 4 bytes 的雙重 SHA256
	Payload  []byte   // 實際資料
}

// 每個 peer 連線的處理 goroutine
func handlePeer(conn net.Conn, blockchain *Blockchain) {
	defer conn.Close()
	for {
		msg, err := readMessage(conn)
		if err != nil {
			log.Printf("peer disconnected: %v", err)
			return
		}
		switch string(bytes.TrimRight(msg.Command[:], "\x00")) {
		case "version":
			handleVersion(conn, msg.Payload)
		case "getblocks":
			handleGetBlocks(conn, msg.Payload, blockchain)
		case "block":
			handleBlock(conn, msg.Payload, blockchain)
		}
	}
}
```

常見坑：
- 沒有重放保護，收到同樣資料無限轉發
- 沒有節流，易被垃圾訊息打爆
- 沒有設定連線上限，一台機器被幾千個連線壓垮
- 握手超時沒處理，卡住的連線占用 goroutine 不釋放
- 同步區塊時沒有流量控制，一次請求太多區塊導致 OOM

最佳實踐：
- 為每個已知 txid/block hash 維護一個 seen set（用 LRU cache），避免重複轉發
- 設定 per-peer 和全局的訊息速率限制
- 實作 ban score 機制：行為異常的節點累加懲罰分數，超過閾值斷開

### 3.1.4 PoW 共識算法 `P0`

PoW（Proof of Work）透過計算成本競爭出塊權：
- 礦工調整 nonce，尋找符合難度目標的 hash
- 全網接受「累積工作量最高」的鏈

核心公式（概念）：
- 找到 `hash(block_header) < target`
- `target` 越小，難度越高

PoW 的本質是用物理世界的能量消耗來換取數位世界的信任。這個設計的天才之處在於：計算 hash 需要消耗真實的電力，但驗證 hash 只需要一次計算。這種「做起來難、查起來容易」的非對稱性，正是 PoW 的安全基礎。

要理解難度調整，可以想像一個抽獎遊戲。target 就是中獎號碼的上限——如果 target 是 1000，那麼從 0 到 999 的號碼都算中獎，中獎率很高；如果 target 是 10，只有 0 到 9 能中獎，中獎率就低了很多。Bitcoin 每 2016 個區塊（大約兩週）調整一次 target，目標是讓平均出塊時間維持在 10 分鐘左右。如果過去兩週出塊太快，說明算力增加了，就把 target 調小讓難度升高。

```text
難度調整機制：

出塊時間 < 預期    ───>  target 調小  ───>  難度增加
                                              │
                        ┌─────────────────────┘
                        v
              維持平均出塊時間穩定
                        ^
                        └─────────────────────┐
                                              │
出塊時間 > 預期    ───>  target 調大  ───>  難度降低

Bitcoin: 每 2016 blocks 調整一次，目標 10 min/block
```

工程視角：
- PoW 提供的是機率最終性，不是絕對最終性
- 確認數越高，被回滾機率越低
- Bitcoin 慣例是 6 confirmations（約 1 小時）視為足夠安全

在 Bitcoin 歷史上，最長的鏈重組（chain reorganization）發生在 2010 年，深度達到 53 個區塊，但那是因為一個嚴重的 bug 被修復後導致的。正常運行下，超過 6 個確認的區塊被回滾的機率極低（假設攻擊者沒有超過 50% 算力，回滾 6 blocks 的機率低於 0.1%）。

Go 實作要點：
- 用 `math/big` 比較 hash 與 target
- 難度調整與區塊時間要解耦
- 驗證端一定要重算 header hash

```go
// PoW 挖礦核心邏輯
func (pow *ProofOfWork) Mine() (int64, []byte) {
	var hashInt big.Int
	var hash [32]byte
	nonce := int64(0)

	for nonce < math.MaxInt64 {
		data := pow.prepareData(nonce)
		hash = sha256.Sum256(data)
		hashInt.SetBytes(hash[:])

		// hash < target 表示找到了有效的 nonce
		if hashInt.Cmp(pow.target) == -1 {
			break
		}
		nonce++
	}
	return nonce, hash[:]
}

// 驗證 PoW —— 任何節點收到區塊後都必須執行
func (pow *ProofOfWork) Validate() bool {
	var hashInt big.Int
	data := pow.prepareData(pow.block.Nonce)
	hash := sha256.Sum256(data)
	hashInt.SetBytes(hash[:])
	return hashInt.Cmp(pow.target) == -1
}
```

常見坑：
- 只驗 nonce 不驗完整 header
- 難度固定不調整，導致出塊失衡
- 沒有限制 nonce 搜索範圍，導致無限迴圈（應設合理上限或加入 extraNonce 機制）
- 用 `int32` 存 nonce 導致溢位（Bitcoin 用 uint32，但實務上會結合 extraNonce）

### 3.1.5 UTXO 模型 `P0`

UTXO（未花費輸出）模型不是改餘額，而是消耗舊輸出、產生新輸出：

```text
Inputs(引用舊UTXO) -> Validation -> Outputs(新UTXO + 找零)
```

交易費用：
`fee = sum(inputs) - sum(outputs)`

UTXO 模型是 Bitcoin 最核心的設計之一，也是很多工程師最容易搞混的概念。我們習慣了銀行帳戶模型：你有一個餘額，轉帳就是從你的餘額扣掉一部分。但 UTXO 模型完全不同——你的「餘額」其實是散落在區塊鏈上、屬於你的所有未花費輸出的總和。

用現金來類比最直觀。你錢包裡有一張 100 元和兩張 50 元，你的「餘額」是 200 元，但實際上你持有的是三個獨立的「資金單位」。當你要付 120 元時，你不能把 100 元鈔票撕成 80 和 20，你必須拿出 100 + 50 = 150 元，然後收回 30 元找零。UTXO 就是這樣運作的：你選擇足夠的 inputs（舊鈔票），產生新的 outputs（給收款人的金額 + 找零給自己的金額）。

```text
UTXO 交易範例：

Alice 持有的 UTXO:
  ┌───────────────┐
  │ UTXO-1: 5 BTC │  (來自之前某筆交易)
  └───────────────┘
  ┌───────────────┐
  │ UTXO-2: 3 BTC │  (來自之前某筆交易)
  └───────────────┘

Alice 想轉 6 BTC 給 Bob:

  ┌───────────────┐
  │ Input: UTXO-1 │──┐
  │ (5 BTC)       │  │     ┌────────────────────┐
  └───────────────┘  ├────>│ Output-0: 6 BTC    │ → Bob
  ┌───────────────┐  │     │  (to Bob)           │
  │ Input: UTXO-2 │──┘     ├────────────────────┤
  │ (3 BTC)       │        │ Output-1: 1.999 BTC│ → Alice (找零)
  └───────────────┘        │  (to Alice change)  │
                           └────────────────────┘
                           fee = 8 - 7.999 = 0.001 BTC
```

為什麼 UTXO 重要：
- 天然可追溯資產來源
- 不同 UTXO 可並行驗證
- 有利於審計與安全邊界設計
- 隱私性較好：每次找零可以用新地址

UTXO 模型 vs Account 模型（Ethereum）的工程差異非常顯著。UTXO 模型天然支持並行驗證，因為每個 UTXO 是獨立的，不存在共享狀態。兩筆花費不同 UTXO 的交易可以同時驗證，不需要擔心順序問題。而 Account 模型中，同一個帳戶的多筆交易必須按 nonce 順序處理，這在高並發場景下會成為瓶頸。

Go 實作要點：
- 建立 `TXInput`, `TXOutput`, `Transaction`
- 維護 UTXO 集索引
- coin selection 與 change address 分離

```go
// UTXO 集合查找
func (u *UTXOSet) FindSpendableOutputs(pubKeyHash []byte, amount int) (int, map[string][]int) {
	unspentOutputs := make(map[string][]int)
	accumulated := 0

	u.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(utxoBucket))
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			txID := hex.EncodeToString(k)
			outs := DeserializeOutputs(v)
			for outIdx, out := range outs.Outputs {
				if out.IsLockedWithKey(pubKeyHash) && accumulated < amount {
					accumulated += out.Value
					unspentOutputs[txID] = append(unspentOutputs[txID], outIdx)
				}
			}
		}
		return nil
	})
	return accumulated, unspentOutputs
}
```

常見坑：
- 找零輸出漏建，資金等於白燒（這是真實發生過的事故，有人因此損失大量 BTC）
- 多輸入簽名只簽了一部分輸入
- coin selection 演算法太貪心，產生大量碎片 UTXO，導致後續交易手續費過高
- 沒有考慮 dust limit（太小的 UTXO 沒有實用價值，因為花費它的手續費可能超過它的金額）

最佳實踐：
- 永遠在建立交易後檢查 `sum(inputs) >= sum(outputs) + fee`
- coin selection 優先使用接近目標金額的 UTXO，減少碎片
- 找零地址與收款地址分開管理，提升隱私性

## 3.2 區塊鏈發展歷程

### 3.2.1 區塊鏈發展現狀 `P1`

現況是多鏈並行：
- L1 提供安全與結算
- L2 提供擴容與低費
- 應用端分化為 DeFi、支付、RWA、遊戲、社交

區塊鏈產業從 2009 年 Bitcoin 誕生至今，已經經歷了多次典範轉移。早期的「區塊鏈 1.0」時代以 Bitcoin 為代表，主要解決點對點電子現金問題。2015 年 Ethereum 上線後，「區塊鏈 2.0」時代開啟，智能合約讓鏈上可程式化成為現實。到了 2020 年代，產業進入多鏈並行時代，L1（如 Ethereum、Solana、Avalanche）提供底層安全和結算，L2（如 Arbitrum、Optimism、zkSync）提供擴容和低手續費。

從工程師的角度，現況的關鍵變化是：開發者不再只面對一條鏈。一個 DeFi 協議可能同時部署在 Ethereum mainnet、Arbitrum、Polygon 和 Base 上。這意味著後端系統需要處理多鏈索引、跨鏈訊息、以及不同鏈的確認時間差異。這對錢包和交易所的工程架構提出了更高的要求。

### 3.2.2 區塊鏈 2.0 時代 `P1`

2.0 一般指智能合約時代：
- 不只轉帳，而是鏈上程式
- 出現可組合協議（借貸、交易、衍生品）

Ethereum 最大的創新在於引入了圖靈完備的虛擬機（EVM）。Bitcoin 的 Script 語言是故意設計成非圖靈完備的——它只能做有限的條件判斷，無法實現循環和複雜邏輯。Ethereum 打破了這個限制，讓開發者可以在鏈上部署任意程式。這催生了 DeFi（去中心化金融）生態系統：Uniswap 用 AMM 演算法實現了無需做市商的代幣交易、Aave 實現了無需銀行的借貸、MakerDAO 創造了去中心化穩定幣。

可組合性（Composability）是區塊鏈 2.0 時代最有價值的特性之一。因為所有智能合約都部署在同一個 EVM 上，一個合約可以無許可地呼叫另一個合約。這被稱為「DeFi 樂高」——開發者可以像拼樂高一樣，把不同協議的功能組合起來，創造新的金融產品。例如，一筆交易可以同時在 Uniswap 換幣、在 Aave 借貸、在 Yearn 理財，全部在一個原子交易中完成。

### 3.2.3 區塊鏈行業未來展望 `P1`

主要方向：
- ZK 証明普及
- Account Abstraction 提升錢包 UX
- 合規與鏈上身份整合
- 跨鏈互操作標準化

ZK（Zero-Knowledge）證明是目前區塊鏈技術發展最重要的方向之一。ZK-Rollup 可以將數百筆交易壓縮成一個證明，在 L1 上驗證這個證明就等於驗證了所有交易。這不僅大幅提升了吞吐量，還保留了 L1 的安全性。zkSync、StarkNet、Polygon zkEVM 都是這個方向的代表項目。對後端工程師來說，理解 ZK 證明的生成和驗證流程，將成為未來幾年的核心競爭力。

Account Abstraction（AA，帳戶抽象）是另一個重要趨勢。傳統以太坊錢包的 UX 非常差：用戶需要管理私鑰、理解 gas、手動設定 nonce。ERC-4337 標準讓智能合約錢包成為一等公民，支持社交恢復、批量交易、gas 代付等功能。這對錢包開發工程師來說，意味著架構設計需要從「管理 EOA 私鑰」轉向「管理智能合約錢包」。

## 3.3 區塊鏈開發技術選型

### 3.3.1 DApp 架構分析 `P0`

標準 DApp 分層：

```text
Frontend -> API/Backend -> Wallet/Signer -> RPC/Node -> Smart Contract
                                     |
                                     +-> Indexer/DB/Monitoring
```

一個生產級 DApp 的架構遠比上面的圖複雜。讓我們展開來看每一層的職責和選型考量：

```text
┌─────────────────────────────────────────────────────┐
│                   Frontend Layer                     │
│  React/Next.js + wagmi/viem + WalletConnect          │
└───────────────────────┬─────────────────────────────┘
                        │ REST/GraphQL/WebSocket
┌───────────────────────┴─────────────────────────────┐
│                   Backend Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ API 服務  │  │ 交易組裝  │  │ 風控引擎          │  │
│  │ Gateway   │  │ Tx Build  │  │ Rate Limit/ACL   │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
│  ┌────┴──────────────┴─────────────────┴──────────┐  │
│  │              Message Queue (Kafka/NATS)         │  │
│  └────────────────────┬───────────────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │
     ┌──────────────────┼──────────────────┐
     │                  │                  │
┌────┴─────┐   ┌───────┴──────┐   ┌──────┴───────┐
│ 自建節點  │   │ 第三方 RPC   │   │  Indexer     │
│ geth/op  │   │ Alchemy/Infura│   │ TheGraph/DB  │
└──────────┘   └──────────────┘   └──────────────┘
```

選型檢查：
- 鏈：成本、最終性、開發工具、生態流動性
- 節點：自建 + 第三方雙路
- 索引：即時查詢與歷史分析分離
- 風控：交易模擬、限額、名單、告警

節點選型是工程決策中最關鍵的環節之一。自建節點（如 geth、op-geth）給你完全控制權，但需要持續維護、同步、和監控。以 Ethereum 全節點為例，截至 2024 年，archive node 需要超過 15 TB 的 SSD 空間。第三方 RPC 服務（如 Alchemy、Infura、QuickNode）省去維護成本，但引入了外部依賴。最佳策略是雙路：業務關鍵路徑走自建節點，備援走第三方服務，兩者之間做健康檢查和自動切換。

索引層決定了你的查詢能力。鏈上資料是按區塊線性儲存的，要做「查某個地址的所有交易」這類查詢非常低效。Indexer 的工作是監聽鏈上事件，將資料轉換成適合查詢的格式存入資料庫。The Graph 提供了去中心化的索引方案，但很多團隊選擇自建索引服務，用 PostgreSQL + 事件監聽來實現。

### 3.3.2 公鏈與聯盟鏈之爭 `P1`

- 公鏈：開放、抗審查、治理慢
- 聯盟鏈：可控、性能高、信任假設較集中

決策原則：
- 對外資產流通與可組合性 -> 公鏈優先
- 企業內部多方協作與合規 -> 聯盟鏈可行

這不是一個二選一的問題，而是根據業務場景做出的工程決策。公鏈的核心價值是開放性和抗審查性——任何人都可以參與，沒有人可以單方面修改規則。這對於 DeFi、NFT 等需要全球流動性的場景是必需的。聯盟鏈（如 Hyperledger Fabric、FISCO BCOS）的價值在於可控性和合規性——參與節點身份已知，可以實現隱私保護和權限管理，適合銀行間結算、供應鏈金融等 B2B 場景。

從工程師的角度，兩者的技術棧差異不大。核心的密碼學、共識、P2P 概念是共通的。但具體到開發工具、部署流程、監控方式上有顯著不同。公鏈開發通常使用 Solidity + Hardhat/Foundry，部署到公開測試網再到主網；聯盟鏈開發可能使用 Go/Java 寫鏈碼（Chaincode），部署到組織自建的網路中。

## 3.4 區塊鏈行業應用示例

### 3.4.1 數字金融 `P1`

- 支付結算
- 借貸與抵押
- 資產代幣化

數位金融是區塊鏈目前最成熟的應用領域。跨境支付是一個典型場景：傳統 SWIFT 轉帳需要 1-5 個工作天，中間經過多個代理銀行，每一層都收取手續費。使用穩定幣（如 USDC）在鏈上轉帳，可以在幾分鐘內完成結算，手續費低於 1 美元。Visa 已經開始在 Solana 和 Ethereum 上結算 USDC 支付。

資產代幣化（Real World Assets, RWA）是另一個快速增長的方向。把國債、房地產、藝術品等傳統資產代幣化，讓它們可以在鏈上自由交易和分割。BlackRock 的 BUIDL 基金就是一個將美國國債代幣化的產品，允許投資者以更低的門檻和更高的流動性投資國債。

### 3.4.2 電子存證 `P2`

- 文件 hash 上鏈
- 時間戳與證據鏈

電子存證是區塊鏈最簡單直接的應用之一。核心思路是：不需要把完整文件存上鏈（那樣太貴了），只需要把文件的 hash 存上鏈。當需要驗證時，重新計算文件的 hash，與鏈上記錄比對即可。因為區塊鏈的不可篡改性，這相當於在某個時間點對文件做了一次公證。

在中國，多個法院已經認可區塊鏈存證的法律效力。杭州互聯網法院在 2018 年首次採納了區塊鏈存證作為有效證據。技術實現上，通常會將文件 hash、時間戳、存證人資訊打包成一筆交易發送到鏈上，同時在鏈下保存完整文件和索引關係。

### 3.4.3 食品安全 `P2`

- 供應鏈節點上傳批次資料
- 以不可篡改日誌提供追溯

食品供應鏈追溯是聯盟鏈最典型的應用場景之一。Walmart 與 IBM 合作的 Food Trust 平台，將食品從農場到餐桌的每個環節記錄上鏈。當出現食品安全問題時，追溯時間從幾天縮短到幾秒。

```text
食品供應鏈追溯流程：

┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐
│ 農場 │──>│ 加工 │──>│ 物流 │──>│ 倉儲 │──>│ 零售 │
└──┬───┘   └──┬───┘   └──┬───┘   └──┬───┘   └──┬───┘
   │          │          │          │          │
   v          v          v          v          v
┌──────────────────────────────────────────────────┐
│              區塊鏈（不可篡改記錄）                │
│  batch-001: 種植日期, 農藥檢測, 加工溫度,         │
│             運輸溫度, 到店時間, ...                │
└──────────────────────────────────────────────────┘
```

技術挑戰在於「鏈上資料的可信度取決於鏈下資料的輸入品質」。區塊鏈能保證資料一旦寫入就不可篡改，但無法保證寫入的資料本身是真實的。這就是所謂的「garbage in, garbage out」問題。解決方案通常是結合 IoT 設備自動採集資料（如溫度感測器、GPS 追蹤），減少人為介入。

## 實訓：區塊鏈理論在線 demo 演示 `P1`

建議做一個最小 demo：
1. 上傳一段文字，計算 hash
2. 模擬打包到區塊，生成前後鏈接
3. 模擬 PoW 挖礦（低難度）
4. 模擬 UTXO 交易與找零

驗收點：
- 任意改動歷史交易會讓後續區塊校驗失敗
- UTXO 花費後不可再次花費

以下是一個完整的 Go demo 骨架，涵蓋上述所有功能：

```go
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"
)

// 簡化區塊結構
type Block struct {
	Timestamp    int64
	Data         []byte
	PrevHash     []byte
	Hash         []byte
	Nonce        int64
}

// 簡化區塊鏈
type Blockchain struct {
	Blocks []*Block
}

// 計算區塊 hash
func (b *Block) SetHash() {
	data := append(b.PrevHash, b.Data...)
	hash := sha256.Sum256(data)
	b.Hash = hash[:]
}

// 簡化 PoW（目標：hash 前 n bits 為 0）
func (b *Block) Mine(targetBits int) {
	target := big.NewInt(1)
	target.Lsh(target, uint(256-targetBits))

	for b.Nonce = 0; ; b.Nonce++ {
		data := append(b.PrevHash, b.Data...)
		data = append(data, IntToBytes(b.Nonce)...)
		hash := sha256.Sum256(data)

		var hashInt big.Int
		hashInt.SetBytes(hash[:])
		if hashInt.Cmp(target) == -1 {
			b.Hash = hash[:]
			break
		}
	}
}

// 驗證鏈完整性
func (bc *Blockchain) Validate() bool {
	for i := 1; i < len(bc.Blocks); i++ {
		prev := bc.Blocks[i-1]
		curr := bc.Blocks[i]
		if !bytes.Equal(curr.PrevHash, prev.Hash) {
			fmt.Printf("Block %d: PrevHash mismatch!\n", i)
			return false
		}
	}
	return true
}
```

這個 demo 的重點不在於完整性，而在於讓學習者親手體驗幾個核心概念：改動一個區塊的資料後，重新計算 hash，會發現後續所有區塊的 PrevHash 都不匹配了。這就是區塊鏈「不可篡改」的直觀體驗。

## 章節回顧與工程要點

這章覆蓋了區塊鏈開發者必須掌握的四個基礎支柱，每一個都對應著真實系統中的關鍵工程決策：

**hash 函數解決資料完整性**。在實際開發中，你會在交易 ID 計算、區塊鏈接、Merkle Tree 構建、地址生成等幾乎所有環節用到 hash。掌握序列化的穩定性、欄位順序一致性、以及 endianness 問題，是避免「同樣的資料算出不同 hash」這類 bug 的關鍵。

**P2P 網路解決資料傳播**。去中心化系統沒有中央伺服器來分發資料，必須依靠節點之間的 gossip protocol。理解節點發現、握手、訊息去重、速率限制這些機制，才能設計出既高效又抗攻擊的網路層。

**PoW/共識解決誰是正確歷史**。共識機制是區塊鏈最核心的創新。PoW 用物理世界的能量消耗來換取數位世界的信任，而難度調整機制確保了系統在算力變化時仍能穩定運行。理解「機率最終性」和「確認數」的概念，對設計交易確認流程至關重要。

**UTXO 解決價值轉移與可追蹤**。UTXO 模型和 Account 模型是兩種截然不同的狀態管理方式。UTXO 的並行驗證能力和可追溯性是它的核心優勢，但 coin selection 和找零管理增加了工程複雜度。

## 白話總結

簡單來說，區塊鏈就是一群互不信任的人，靠著數學和密碼學達成共識的系統。hash 是整個系統的「指紋機」，讓你能用一小段固定長度的資料代表任意大小的東西，而且改一個字就會完全不同。P2P 網路讓每個節點都平等地傳播資料，不需要一個「總管」來分發。PoW 共識就像是用燒電來投票——你投入的算力越多，你的「話語權」越大，但驗證別人的投票結果只需要一秒鐘。UTXO 模型把你的餘額拆成一張一張的「鈔票」，每次交易就是收舊鈔、找零錢的過程。搞懂這四個東西，你就掌握了區塊鏈開發最底層的心智模型，後面不管是寫合約還是做錢包，都是在這個基礎上蓋房子。

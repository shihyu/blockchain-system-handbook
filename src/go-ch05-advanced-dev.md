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

在建造自己的區塊鏈之前，必須把 hash 函數的使用方式釘死。不同於第三章的概念介紹，這裡要解決的是工程實作中「如何確保 hash 在所有節點上計算結果一致」的問題。這個問題看似簡單，但在實務中是 bug 最多的地方之一。

hash 一致性的關鍵在於序列化。同一個 `Block` struct，如果序列化方式不一致，hash 結果就不同。Go 的 `encoding/json` 在不同版本中可能改變 key 排列順序（雖然實際上它按字母序排列），更危險的是浮點數的序列化——`1.0` 和 `1` 在 JSON 中可能被不同實作處理成不同字串。因此，區塊鏈中永遠不要用 JSON 做 hash 前的序列化，而要用 binary encoding。

```go
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
)

// 穩定序列化：用 binary encoding 確保跨平台一致
func IntToBytes(n int64) []byte {
	buf := new(bytes.Buffer)
	_ = binary.Write(buf, binary.BigEndian, n)
	return buf.Bytes()
}

// 計算區塊 header hash
func CalcBlockHash(prevHash, merkleRoot []byte, timestamp, nonce int64) []byte {
	data := bytes.Join([][]byte{
		prevHash,
		merkleRoot,
		IntToBytes(timestamp),
		IntToBytes(nonce),
	}, []byte{})

	hash := sha256.Sum256(data)
	return hash[:]
}

// 雙重 hash（Bitcoin 風格）
func DoubleHash(data []byte) []byte {
	first := sha256.Sum256(data)
	second := sha256.Sum256(first[:])
	return second[:]
}

func main() {
	hash := CalcBlockHash(
		[]byte{0x00}, // prevHash (genesis)
		[]byte("merkle-root"),
		1700000000,
		42,
	)
	fmt.Println(hex.EncodeToString(hash))
}
```

最佳實踐：
- 所有整數使用 `binary.BigEndian` 序列化
- hash 結果在記憶體中用 `[]byte` 傳遞，只在顯示給人看時轉 `hex.EncodeToString`
- 為每個需要 hash 的結構體寫一個 `Serialize()` 方法，並用 regression test 鎖定

常見坑：
- 用 `fmt.Sprintf("%v", block)` 做序列化——Go struct 的 print 格式不穩定
- 忘記 `sha256.Sum256` 回傳的是 `[32]byte` 而不是 `[]byte`，需要用 `hash[:]` 轉換
- 不同節點的系統時鐘不同步，如果把 `time.Now()` 直接放進 hash，可能導致不同節點算出不同的 hash

### 5.1.2 Go 語言與 Base58 編碼 `P0`

Base58 用於人類可讀地址，避免 `0/O/I/l` 混淆。

典型地址流程：
1. 公鑰 hash（`SHA256 + RIPEMD160`）
2. 加版本前綴
3. 加 checksum
4. Base58 編碼

Base58 是 Bitcoin 專門設計的編碼格式。相比 Base64，Base58 去掉了 `0`、`O`、`I`、`l`、`+`、`/` 這六個容易混淆或在 URL 中有特殊意義的字元。結果是：地址可以被安全地複製貼上、口頭朗讀、列印在紙上，降低了人為出錯的機率。

Checksum 是地址安全的最後一道防線。Bitcoin 地址的 checksum 是對 `version + payload` 做兩次 SHA256，取前 4 bytes 附加在末尾。當用戶輸入一個地址時，程式可以重新計算 checksum 並比對，如果不匹配就說明地址被輸入錯了。這個機制的錯誤檢測率超過 99.99%。

```text
地址生成完整流程：

Public Key (65 bytes, uncompressed)
    │
    v
SHA256 ──> RIPEMD160 ──> PubKeyHash (20 bytes)
    │
    v
Version Byte (0x00 for mainnet) + PubKeyHash
    │
    v
Double SHA256 ──> 取前 4 bytes ──> Checksum
    │
    v
Version + PubKeyHash + Checksum
    │
    v
Base58Encode ──> Bitcoin Address (如: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)
```

```go
// Base58 編碼實作
var b58Alphabet = []byte("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")

func Base58Encode(input []byte) []byte {
	var result []byte
	x := new(big.Int).SetBytes(input)
	base := big.NewInt(58)
	zero := big.NewInt(0)
	mod := new(big.Int)

	for x.Cmp(zero) != 0 {
		x.DivMod(x, base, mod)
		result = append(result, b58Alphabet[mod.Int64()])
	}

	// 反轉
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	// 處理前導零（對應 Base58 的 '1'）
	for _, b := range input {
		if b != 0x00 {
			break
		}
		result = append([]byte{b58Alphabet[0]}, result...)
	}

	return result
}

// 生成帶 checksum 的地址
func GenerateAddress(pubKeyHash []byte, version byte) []byte {
	versionedPayload := append([]byte{version}, pubKeyHash...)
	checksum := Checksum(versionedPayload)
	fullPayload := append(versionedPayload, checksum...)
	return Base58Encode(fullPayload)
}

func Checksum(payload []byte) []byte {
	first := sha256.Sum256(payload)
	second := sha256.Sum256(first[:])
	return second[:4] // 只取前 4 bytes
}
```

常見坑：
- 前導零的處理很容易出錯——在 Base58 中，0x00 對應 '1'，必須特別處理
- 混淆 Base58 和 Base58Check——後者包含 version byte 和 checksum
- 使用第三方 Base58 庫時沒有驗證其處理前導零的行為

### 5.1.3 Go 語言與默克爾樹 `P0`

Merkle Tree 用於交易集合摘要：
- 葉節點：交易 hash
- 父節點：`hash(left || right)`
- 根節點：區塊 header 的 `MerkleRoot`

Merkle Tree 是區塊鏈中驗證資料完整性的核心資料結構。它的精妙之處在於：你不需要下載所有交易就能驗證某筆交易是否包含在區塊中。只需要提供一條從葉節點到根節點的「證明路徑」（Merkle Proof），大小是 O(log n)，就能完成驗證。Bitcoin 的 SPV（Simplified Payment Verification）輕節點正是基於這個原理運作的。

```text
Merkle Tree 結構：

              Root Hash
            /          \
        Hash01          Hash23
       /      \        /      \
    Hash0    Hash1   Hash2    Hash3
      |        |       |        |
    Tx0      Tx1     Tx2      Tx3

驗證 Tx1 是否在樹中，只需要：
  - Tx1 本身
  - Hash0（兄弟節點）
  - Hash23（叔父節點）

路徑：hash(Tx1) -> hash(Hash0 || Hash1) -> hash(Hash01 || Hash23) == Root?
大小：O(log n) 而非 O(n)
```

對於輕錢包（如手機端），Merkle Proof 的價值巨大。一個包含 4000 筆交易的區塊，完整下載需要幾百 KB，但 Merkle Proof 只需要 12 個 hash（每個 32 bytes），總共 384 bytes 就能驗證任意一筆交易的存在性。

```go
// Merkle Tree 實作
type MerkleTree struct {
	RootNode *MerkleNode
}

type MerkleNode struct {
	Left  *MerkleNode
	Right *MerkleNode
	Data  []byte
}

func NewMerkleNode(left, right *MerkleNode, data []byte) *MerkleNode {
	node := &MerkleNode{}

	if left == nil && right == nil {
		// 葉節點：直接 hash 交易資料
		hash := sha256.Sum256(data)
		node.Data = hash[:]
	} else {
		// 內部節點：hash(left || right)
		prevHashes := append(left.Data, right.Data...)
		hash := sha256.Sum256(prevHashes)
		node.Data = hash[:]
	}

	node.Left = left
	node.Right = right
	return node
}

func NewMerkleTree(data [][]byte) *MerkleTree {
	if len(data) == 0 {
		return &MerkleTree{}
	}

	var nodes []*MerkleNode

	// 奇數個葉節點時，複製最後一個
	if len(data)%2 != 0 {
		data = append(data, data[len(data)-1])
	}

	// 建立葉節點
	for _, datum := range data {
		nodes = append(nodes, NewMerkleNode(nil, nil, datum))
	}

	// 逐層構建
	for len(nodes) > 1 {
		if len(nodes)%2 != 0 {
			nodes = append(nodes, nodes[len(nodes)-1])
		}
		var level []*MerkleNode
		for i := 0; i < len(nodes); i += 2 {
			node := NewMerkleNode(nodes[i], nodes[i+1], nil)
			level = append(level, node)
		}
		nodes = level
	}

	return &MerkleTree{RootNode: nodes[0]}
}
```

常見坑：
- 奇數葉節點時複製最後一個葉節點（Bitcoin 的做法，但這引入了一個已知的「duplicate transaction」漏洞，CVE-2012-2459）
- 序列化不一致導致根 hash 不一致
- 沒有處理空交易列表的邊界情況

### 5.1.4 Go 語言實現 P2P 網絡 `P0`

最小消息定義建議：
- `version`
- `getblocks`
- `inv`
- `getdata`
- `block`
- `tx`

實現一個最小但可用的 P2P 網路層，需要解決三個核心問題：消息定義、消息路由、狀態同步。Bitcoin 的 P2P 協議定義了超過 30 種消息類型，但對於教學鏈，6 種就足夠讓兩個節點互相同步區塊和交易。

```text
節點同步流程（Initial Block Download）：

Node A (新節點)              Node B (已有區塊)

1. version ─────────────>
                          <───────────── version
2. getblocks ───────────>  (告訴 B 自己的最高區塊)
                          <───────────── inv (回覆 B 有但 A 沒有的區塊 hash 列表)
3. getdata ─────────────>  (請求具體的區塊)
                          <───────────── block (回覆完整區塊)
   (驗證並儲存區塊)
   (重複 3 直到同步完成)
```

```go
// 消息類型定義
const (
	CmdVersion   = "version"
	CmdGetBlocks = "getblocks"
	CmdInv       = "inv"
	CmdGetData   = "getdata"
	CmdBlock     = "block"
	CmdTx        = "tx"
)

// Version 消息
type MsgVersion struct {
	Version     int32
	BestHeight  int64
	AddrFrom    string
}

// Inv 消息（庫存通知）
type MsgInv struct {
	Type  string   // "block" or "tx"
	Items [][]byte // hash 列表
}

// P2P 伺服器骨架
type Server struct {
	nodeAddr   string
	knownPeers map[string]bool
	blockchain *Blockchain
	mempool    map[string]*Transaction
	mu         sync.RWMutex
}

func (s *Server) Start() error {
	ln, err := net.Listen("tcp", s.nodeAddr)
	if err != nil {
		return err
	}
	defer ln.Close()

	// 啟動時向 seed nodes 發送 version
	for peer := range s.knownPeers {
		go s.sendVersion(peer)
	}

	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Printf("accept error: %v", err)
			continue
		}
		go s.handleConnection(conn)
	}
}

func (s *Server) handleConnection(conn net.Conn) {
	defer conn.Close()
	// 設定讀取超時
	conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	msg, err := readMessage(conn)
	if err != nil {
		return
	}

	switch msg.Command {
	case CmdVersion:
		s.handleVersion(msg, conn)
	case CmdGetBlocks:
		s.handleGetBlocks(msg, conn)
	case CmdInv:
		s.handleInv(msg, conn)
	case CmdGetData:
		s.handleGetData(msg, conn)
	case CmdBlock:
		s.handleBlock(msg, conn)
	case CmdTx:
		s.handleTx(msg, conn)
	}
}
```

工程建議：
- 每種消息用獨立 handler
- 建立 peer set 與去重 cache
- 記錄最後已知區塊高度
- 為每個 peer 維護一個 send queue，避免在 handler 中直接寫 socket 造成阻塞
- 用 `context.Context` 控制 goroutine 生命週期，避免洩漏

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

區塊結構的設計是整條鏈的基礎。Bitcoin 的區塊 header 固定 80 bytes，包含 6 個欄位：Version、PrevHash、MerkleRoot、Timestamp、Bits、Nonce。這個設計的精妙之處在於：header 與交易資料分離——PoW 挖礦只需要計算 80 bytes 的 header hash，而不需要把所有交易都放進計算。交易資料通過 MerkleRoot 間接綁定到 header 上。

```text
區塊結構解剖：

┌─────────────────────────────────────────┐
│              Block Header (80 bytes)     │
│  ┌─────────────┬──────────────────────┐ │
│  │ Version     │ 協議版本號 (4 bytes)  │ │
│  ├─────────────┼──────────────────────┤ │
│  │ PrevHash    │ 前一區塊 hash (32B)  │ │
│  ├─────────────┼──────────────────────┤ │
│  │ MerkleRoot  │ 交易 Merkle 根 (32B) │ │
│  ├─────────────┼──────────────────────┤ │
│  │ Timestamp   │ 出塊時間戳 (4 bytes) │ │
│  ├─────────────┼──────────────────────┤ │
│  │ Bits        │ 難度目標 (4 bytes)    │ │
│  ├─────────────┼──────────────────────┤ │
│  │ Nonce       │ 隨機數 (4 bytes)      │ │
│  └─────────────┴──────────────────────┘ │
├─────────────────────────────────────────┤
│              Transactions                │
│  ┌──────────────────────────────────┐   │
│  │ Coinbase Tx (區塊獎勵)           │   │
│  ├──────────────────────────────────┤   │
│  │ Tx 1                            │   │
│  ├──────────────────────────────────┤   │
│  │ Tx 2                            │   │
│  ├──────────────────────────────────┤   │
│  │ ...                             │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

序列化建議：
- `encoding/gob`（教學簡單）或 `protobuf`（可演進）
- 解碼錯誤要立即失敗，不可靜默忽略

`encoding/gob` 是 Go 原生的序列化格式，使用簡單，但有一個重要限制：它不是跨語言的。如果你的鏈未來需要支持非 Go 客戶端，建議從一開始就使用 protobuf 或 CBOR。

```go
// 區塊序列化與反序列化
func (b *Block) Serialize() ([]byte, error) {
	var result bytes.Buffer
	encoder := gob.NewEncoder(&result)
	if err := encoder.Encode(b); err != nil {
		return nil, fmt.Errorf("serialize block: %w", err)
	}
	return result.Bytes(), nil
}

func DeserializeBlock(data []byte) (*Block, error) {
	var block Block
	decoder := gob.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&block); err != nil {
		return nil, fmt.Errorf("deserialize block: %w", err)
	}
	return &block, nil
}

// 建立新區塊的工廠函數
func NewBlock(txs []*Transaction, prevHash []byte, height int64) *Block {
	block := &Block{
		Version:   1,
		PrevHash:  prevHash,
		Timestamp: time.Now().Unix(),
		Txs:       txs,
	}

	// 計算 Merkle Root
	var txHashes [][]byte
	for _, tx := range txs {
		txHashes = append(txHashes, tx.ID)
	}
	tree := NewMerkleTree(txHashes)
	block.MerkleRoot = tree.RootNode.Data

	// 執行 PoW
	pow := NewProofOfWork(block)
	nonce, hash := pow.Mine()
	block.Nonce = nonce
	block.Hash = hash

	return block
}
```

### 5.2.2 PoW 算法實現 `P0`

流程：
1. 準備區塊 header bytes
2. 從 nonce=0 迭代
3. 計算 hash，與 target 比較
4. 命中後寫入區塊 `Nonce` 與 `Hash`

```text
PrepareHeader -> Hash -> CompareTarget -> Success? -> next nonce
```

PoW 的實作看似簡單（就是個 for 迴圈），但有幾個工程細節決定了正確性和效能。首先，`prepareData` 必須確保欄位順序和序列化方式在所有節點上完全一致。其次，target 的計算必須從 `Bits` 欄位正確轉換——Bitcoin 使用一種壓縮格式來表示 256 bit 的 target。

```go
// PoW 完整實作
const targetBits = 16 // 教學用低難度

type ProofOfWork struct {
	block  *Block
	target *big.Int
}

func NewProofOfWork(b *Block) *ProofOfWork {
	target := big.NewInt(1)
	target.Lsh(target, uint(256-targetBits))
	return &ProofOfWork{b, target}
}

// 準備用於 hash 的資料
func (pow *ProofOfWork) prepareData(nonce int64) []byte {
	return bytes.Join([][]byte{
		pow.block.PrevHash,
		pow.block.MerkleRoot,
		IntToBytes(pow.block.Timestamp),
		IntToBytes(int64(targetBits)),
		IntToBytes(nonce),
	}, []byte{})
}

// 挖礦
func (pow *ProofOfWork) Mine() (int64, []byte) {
	var hashInt big.Int
	var hash [32]byte
	nonce := int64(0)
	maxNonce := int64(math.MaxInt64)

	fmt.Printf("Mining block with %d transactions...\n", len(pow.block.Txs))

	for nonce < maxNonce {
		data := pow.prepareData(nonce)
		hash = sha256.Sum256(data)
		hashInt.SetBytes(hash[:])

		if hashInt.Cmp(pow.target) == -1 {
			fmt.Printf("Found! nonce=%d hash=%x\n", nonce, hash)
			break
		}
		nonce++
	}
	return nonce, hash[:]
}

// 驗證——收到區塊後必須執行
func (pow *ProofOfWork) Validate() bool {
	var hashInt big.Int
	data := pow.prepareData(pow.block.Nonce)
	hash := sha256.Sum256(data)
	hashInt.SetBytes(hash[:])
	isValid := hashInt.Cmp(pow.target) == -1

	// 額外驗證：重算的 hash 必須與區塊聲稱的 hash 一致
	if isValid && !bytes.Equal(hash[:], pow.block.Hash) {
		return false
	}
	return isValid
}
```

驗證函數：
- 每個節點收到區塊都必須重算驗證
- 不能信任對方提供的 `Hash` 欄位
- 驗證成本是 O(1)（一次 hash 計算），但挖礦成本是 O(2^targetBits) 期望值

最佳實踐：
- 在挖礦過程中定期檢查是否有新區塊到達（如果有，應該中止當前挖礦，基於新區塊重新開始）
- 將挖礦邏輯放在獨立的 goroutine 中，用 `context.WithCancel` 控制中止

## 5.3 區塊數據如何持久化

### 5.3.1 Go 語言與 boltDB 實戰 `P0`

BoltDB（bbolt）特性：
- 單機嵌入式 KV
- ACID 交易
- 讀多寫少場景適合教學鏈

BoltDB（現在的維護版本是 bbolt，由 etcd 團隊維護）是 Go 生態中最受歡迎的嵌入式 KV 儲存之一。它的 API 非常簡潔：所有操作都在 `Tx`（事務）中完成，`View` 是唯讀事務，`Update` 是讀寫事務。bbolt 使用 B+ tree 作為底層資料結構，所有資料按 key 排序存儲，支持高效的範圍查詢。

對於教學鏈，bbolt 是理想的選擇：不需要安裝外部資料庫、不需要管理連線池、不需要網路通訊。但它有一個重要限制：同一時間只允許一個寫事務（因為使用了檔案鎖）。對於生產級區塊鏈，通常會選擇 LevelDB（Bitcoin Core 使用）或 RocksDB（Ethereum geth 使用）。

建議 bucket：
- `blocks`：`hash -> block bytes`
- `meta`：`lastHash -> ...`
- `utxo`：`txid:vout -> output`

```go
// 資料庫初始化
func InitDB(dbPath string) (*bolt.DB, error) {
	db, err := bolt.Open(dbPath, 0600, &bolt.Options{Timeout: 1 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	err = db.Update(func(tx *bolt.Tx) error {
		// 建立必要的 bucket
		for _, bucket := range []string{"blocks", "meta", "utxo"} {
			_, err := tx.CreateBucketIfNotExists([]byte(bucket))
			if err != nil {
				return fmt.Errorf("create bucket %s: %w", bucket, err)
			}
		}
		return nil
	})
	return db, err
}

// 儲存區塊
func SaveBlock(db *bolt.DB, block *Block) error {
	return db.Update(func(tx *bolt.Tx) error {
		blocksBucket := tx.Bucket([]byte("blocks"))
		metaBucket := tx.Bucket([]byte("meta"))

		// 序列化並寫入
		data, err := block.Serialize()
		if err != nil {
			return err
		}
		if err := blocksBucket.Put(block.Hash, data); err != nil {
			return err
		}

		// 更新 lastHash
		return metaBucket.Put([]byte("lastHash"), block.Hash)
	})
}
```

### 5.3.2 區塊數據如何持久化 `P0`

寫入流程：
1. 驗證區塊
2. 寫入 `blocks`
3. 更新 `lastHash`
4. 更新 UTXO 索引

持久化流程的正確性至關重要——如果寫入過程中崩潰，資料庫可能處於不一致狀態。bbolt 的 ACID 事務保證了原子性：要麼所有操作都成功，要麼都不生效。但我們仍然需要確保寫入順序的邏輯正確性。

```go
// 完整的區塊持久化流程
func (bc *Blockchain) AddBlock(block *Block) error {
	// 1. 驗證區塊
	if err := bc.validateBlock(block); err != nil {
		return fmt.Errorf("invalid block: %w", err)
	}

	// 2. 在一個事務中完成所有寫入
	return bc.db.Update(func(tx *bolt.Tx) error {
		blocksBucket := tx.Bucket([]byte("blocks"))
		metaBucket := tx.Bucket([]byte("meta"))
		utxoBucket := tx.Bucket([]byte("utxo"))

		// 2a. 寫入區塊
		data, _ := block.Serialize()
		if err := blocksBucket.Put(block.Hash, data); err != nil {
			return err
		}

		// 2b. 更新 UTXO 索引
		for _, txn := range block.Txs {
			// 刪除已花費的 UTXO
			for _, vin := range txn.Vin {
				key := fmt.Sprintf("%x:%d", vin.Txid, vin.Vout)
				if err := utxoBucket.Delete([]byte(key)); err != nil {
					return err
				}
			}
			// 添加新的 UTXO
			for idx, vout := range txn.Vout {
				key := fmt.Sprintf("%x:%d", txn.ID, idx)
				data, _ := SerializeOutput(vout)
				if err := utxoBucket.Put([]byte(key), data); err != nil {
					return err
				}
			}
		}

		// 2c. 更新 lastHash
		return metaBucket.Put([]byte("lastHash"), block.Hash)
	})
}
```

### 5.3.3 區塊數據如何遍歷 `P0`

從 `lastHash` 反向走 `PrevHash` 到 genesis：

```text
last -> prev -> prev -> ... -> genesis
```

區塊鏈的遍歷與普通鏈表相反——我們從最新的區塊開始，沿著 `PrevHash` 指標一路走到創世區塊。這個設計的原因是：新區塊總是引用前一個區塊，而不是前一個區塊引用後一個區塊（因為出塊時還不知道下一個區塊是什麼）。

```go
// 區塊鏈迭代器
type BlockchainIterator struct {
	currentHash []byte
	db          *bolt.DB
}

func (bc *Blockchain) Iterator() *BlockchainIterator {
	var lastHash []byte
	bc.db.View(func(tx *bolt.Tx) error {
		meta := tx.Bucket([]byte("meta"))
		lastHash = meta.Get([]byte("lastHash"))
		return nil
	})
	return &BlockchainIterator{currentHash: lastHash, db: bc.db}
}

func (it *BlockchainIterator) Next() (*Block, error) {
	if len(it.currentHash) == 0 {
		return nil, nil // 已到達 genesis 之前
	}

	var block *Block
	err := it.db.View(func(tx *bolt.Tx) error {
		blocksBucket := tx.Bucket([]byte("blocks"))
		data := blocksBucket.Get(it.currentHash)
		if data == nil {
			return fmt.Errorf("block not found: %x", it.currentHash)
		}
		var err error
		block, err = DeserializeBlock(data)
		return err
	})

	if err != nil {
		return nil, err
	}

	it.currentHash = block.PrevHash
	return block, nil
}

// 使用範例：列印所有區塊
func PrintChain(bc *Blockchain) {
	it := bc.Iterator()
	for {
		block, err := it.Next()
		if err != nil || block == nil {
			break
		}
		fmt.Printf("Block %x\n", block.Hash)
		fmt.Printf("  PrevHash: %x\n", block.PrevHash)
		fmt.Printf("  Timestamp: %d\n", block.Timestamp)
		fmt.Printf("  Nonce: %d\n", block.Nonce)
		fmt.Printf("  Transactions: %d\n", len(block.Txs))
		fmt.Println()
	}
}
```

常見坑：
- 遍歷未處理空 hash 終止條件（genesis block 的 PrevHash 是全零）
- DB 交易未關閉造成資源泄漏（bbolt 的 `View` 和 `Update` 會自動管理，但如果手動使用 `tx.Begin()`，必須確保 `Commit` 或 `Rollback`）
- 遍歷過程中修改資料庫，導致迭代器失效

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

交易結構是 UTXO 模型的核心。`TXInput` 引用一個之前的 `TXOutput`（通過 `Txid` 和 `Vout` 索引），`TXOutput` 定義了新的資產歸屬。一筆交易可以有多個輸入和多個輸出，這讓「合併」和「分割」UTXO 成為可能。

交易 ID 的計算方式很重要：它是整筆交易（去除簽名後）的 hash。為什麼要去除簽名？因為簽名本身依賴於交易 ID（你要先知道交易的內容才能簽名），如果交易 ID 包含簽名，就會形成循環依賴。Bitcoin 的做法是：先計算不含簽名的交易 hash 作為 ID，然後用私鑰對這個 ID 簽名。

```go
// 計算交易 ID
func (tx *Transaction) CalcHash() {
	// 暫時清除簽名，避免循環依賴
	txCopy := *tx
	for i := range txCopy.Vin {
		txCopy.Vin[i].Signature = nil
		txCopy.Vin[i].PubKey = nil
	}

	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	_ = enc.Encode(txCopy)

	hash := sha256.Sum256(buf.Bytes())
	tx.ID = hash[:]
}

// TXOutput 的鎖定與解鎖
func (out *TXOutput) Lock(address []byte) {
	pubKeyHash := Base58Decode(address)
	pubKeyHash = pubKeyHash[1 : len(pubKeyHash)-4] // 去除 version 和 checksum
	out.PubKeyHash = pubKeyHash
}

func (out *TXOutput) IsLockedWithKey(pubKeyHash []byte) bool {
	return bytes.Equal(out.PubKeyHash, pubKeyHash)
}
```

### 5.4.2 如何判斷 CoinBase 交易 `P0`

規則：
- `len(Vin) == 1`
- `Vin[0].Txid == nil`
- `Vin[0].Vout == -1`

CoinBase 交易是區塊鏈中「創造新幣」的唯一途徑。每個區塊的第一筆交易必須是 CoinBase，它沒有任何輸入（因為幣是憑空產生的），只有輸出。礦工通過 CoinBase 交易獲得區塊獎勵和該區塊中所有交易的手續費。

Bitcoin 的 CoinBase 交易有一個額外功能：它的「輸入」欄位可以攜帶任意資料（最多 100 bytes）。Satoshi 在創世區塊的 CoinBase 中寫入了著名的 "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"。礦池通常在這裡寫入礦池標識和區塊高度。

```go
// 建立 CoinBase 交易
func NewCoinbaseTX(to string, data string) *Transaction {
	if data == "" {
		data = fmt.Sprintf("Reward to %s", to)
	}

	txin := TXInput{
		Txid:      nil,
		Vout:      -1,
		Signature: nil,
		PubKey:    []byte(data), // CoinBase 可以攜帶任意資料
	}

	txout := NewTXOutput(BlockReward, to) // BlockReward 如 50 BTC

	tx := Transaction{
		Vin:  []TXInput{txin},
		Vout: []TXOutput{*txout},
	}
	tx.CalcHash()
	return &tx
}

// 判斷是否為 CoinBase 交易
func (tx *Transaction) IsCoinbase() bool {
	return len(tx.Vin) == 1 &&
		tx.Vin[0].Txid == nil &&
		tx.Vin[0].Vout == -1
}
```

### 5.4.3 如何使用 CoinBase 交易 `P0`

CoinBase 用於區塊獎勵，通常每個區塊第一筆交易。

實作要點：
- 獎勵值可參數化
- 高度可寫入 `scriptSig` 或附加欄位

Bitcoin 的區塊獎勵每 210,000 個區塊減半一次：最初是 50 BTC，2012 年減半到 25 BTC，2016 年 12.5 BTC，2020 年 6.25 BTC，2024 年 3.125 BTC。這個減半機制確保了 Bitcoin 的總量上限為 2100 萬枚。在教學鏈中，可以簡化為固定獎勵或以區塊高度計算減半。

```go
const InitialReward = 50

// 根據區塊高度計算獎勵
func CalcBlockReward(height int64) int {
	halvings := height / 210000
	if halvings >= 64 { // 超過 64 次減半後獎勵為 0
		return 0
	}
	return InitialReward >> uint(halvings)
}
```

### 5.4.4 如何查找賬戶的 UTXO `P0`

流程：
1. 從 UTXO 集索引查 `PubKeyHash` 匹配輸出
2. 累加直到滿足轉帳金額
3. 回傳可用輸入與總額

UTXO 查找是錢包最高頻的操作之一。查餘額等於掃描所有屬於某個地址的未花費輸出並求和。為了效率，我們維護一個獨立的 UTXO 集合索引，而不是每次都遍歷整條鏈。

```go
// UTXO 集合
type UTXOSet struct {
	db *bolt.DB
}

// 查詢地址餘額
func (u *UTXOSet) GetBalance(pubKeyHash []byte) int {
	balance := 0
	u.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("utxo"))
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			out := DeserializeOutput(v)
			if out.IsLockedWithKey(pubKeyHash) {
				balance += out.Value
			}
		}
		return nil
	})
	return balance
}

// 查找足夠的 UTXO 用於交易（coin selection）
func (u *UTXOSet) FindSpendableOutputs(pubKeyHash []byte, amount int) (int, map[string][]int) {
	unspentOutputs := make(map[string][]int)
	accumulated := 0

	u.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("utxo"))
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			// key 格式: "txid:vout"
			parts := strings.SplitN(string(k), ":", 2)
			txID := parts[0]
			outIdx, _ := strconv.Atoi(parts[1])

			out := DeserializeOutput(v)
			if out.IsLockedWithKey(pubKeyHash) {
				accumulated += out.Value
				unspentOutputs[txID] = append(unspentOutputs[txID], outIdx)

				if accumulated >= amount {
					return nil // 夠了，提前終止
				}
			}
		}
		return nil
	})
	return accumulated, unspentOutputs
}
```

常見坑：
- 沒標記已花費輸出，導致雙花
- 未處理變更輸出導致餘額錯誤
- coin selection 沒有考慮手續費——找到剛好夠轉帳金額的 UTXO 後，扣除手續費就不夠了
- 在高並發場景下，同一個 UTXO 被兩筆交易同時選中

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

發送交易是 UTXO 模型中最複雜的操作。每一步都有嚴格的正確性要求：coin selection 要確保輸入金額足夠、找零必須產生、簽名必須覆蓋所有輸入、驗證必須重算 hash。

```go
// 發送交易的完整實作
func NewTransaction(from, to string, amount int, utxoSet *UTXOSet, wallets *Wallets) (*Transaction, error) {
	wallet := wallets.GetWallet(from)
	pubKeyHash := HashPubKey(wallet.PublicKey)

	// 1. Coin Selection
	accumulated, validOutputs := utxoSet.FindSpendableOutputs(pubKeyHash, amount)
	if accumulated < amount {
		return nil, fmt.Errorf("insufficient funds: have %d, need %d", accumulated, amount)
	}

	// 2. 建立輸入
	var inputs []TXInput
	for txid, outs := range validOutputs {
		txIDBytes, _ := hex.DecodeString(txid)
		for _, out := range outs {
			inputs = append(inputs, TXInput{
				Txid:   txIDBytes,
				Vout:   out,
				PubKey: wallet.PublicKey,
			})
		}
	}

	// 3. 建立輸出（收款人 + 找零）
	outputs := []TXOutput{*NewTXOutput(amount, to)}
	if accumulated > amount {
		// 找零回到發送者——這一步絕對不能忘！
		outputs = append(outputs, *NewTXOutput(accumulated-amount, from))
	}

	tx := Transaction{Vin: inputs, Vout: outputs}
	tx.CalcHash()

	// 4. 簽名
	utxoSet.Blockchain.SignTransaction(&tx, wallet.PrivateKey)

	return &tx, nil
}
```

最佳實踐：
- 永遠在 `NewTransaction` 結束前驗證 `sum(inputs) == sum(outputs) + fee`
- 找零地址最好用新地址（提升隱私性）
- coin selection 策略：優先選擇「剛好夠用」的 UTXO，其次選擇「最大的一個」，避免碎片化

## 5.5 區塊鏈賬戶地址如何生成

### 5.5.1 公鑰加密與數字簽名 `P0`

常用曲線：`secp256k1`

簽名驗證核心：
- 私鑰簽
- 公鑰驗
- 交易內容變動則簽名失效

`secp256k1` 是 Bitcoin 和 Ethereum 共同使用的橢圓曲線。它的安全性基於橢圓曲線離散對數問題（ECDLP）：已知公鑰（一個曲線上的點），要反推私鑰（一個標量）在計算上不可行。

數位簽名的數學原理可以簡化理解為：私鑰 `k` 和待簽資料 `m` 通過 ECDSA 演算法產生簽名 `(r, s)`。任何人只要有公鑰 `K` 和原始資料 `m`，就能驗證 `(r, s)` 是否由持有 `k` 的人產生。整個過程中，私鑰從未被暴露。

```go
// 使用 Go 標準庫進行 ECDSA 簽名和驗證
import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"math/big"
)

// 生成金鑰對
func NewKeyPair() (ecdsa.PrivateKey, []byte) {
	curve := elliptic.P256() // 教學用 P256，Bitcoin 用 secp256k1
	privateKey, _ := ecdsa.GenerateKey(curve, rand.Reader)

	// 公鑰 = 曲線上的點 (X, Y)，拼接成 bytes
	pubKey := append(privateKey.PublicKey.X.Bytes(), privateKey.PublicKey.Y.Bytes()...)
	return *privateKey, pubKey
}

// 簽名交易
func (tx *Transaction) Sign(privKey ecdsa.PrivateKey, prevTXs map[string]Transaction) {
	if tx.IsCoinbase() {
		return // CoinBase 不需要簽名
	}

	txCopy := tx.TrimmedCopy() // 去除簽名的副本

	for inIdx, vin := range txCopy.Vin {
		prevTX := prevTXs[hex.EncodeToString(vin.Txid)]
		txCopy.Vin[inIdx].PubKey = prevTX.Vout[vin.Vout].PubKeyHash

		txCopy.CalcHash()
		dataToSign := txCopy.ID

		r, s, _ := ecdsa.Sign(rand.Reader, &privKey, dataToSign)
		signature := append(r.Bytes(), s.Bytes()...)
		tx.Vin[inIdx].Signature = signature

		txCopy.Vin[inIdx].PubKey = nil // 重置，處理下一個輸入
	}
}

// 驗證交易簽名
func (tx *Transaction) Verify(prevTXs map[string]Transaction) bool {
	txCopy := tx.TrimmedCopy()
	curve := elliptic.P256()

	for inIdx, vin := range tx.Vin {
		prevTX := prevTXs[hex.EncodeToString(vin.Txid)]
		txCopy.Vin[inIdx].PubKey = prevTX.Vout[vin.Vout].PubKeyHash

		txCopy.CalcHash()
		dataToVerify := txCopy.ID

		// 解析簽名
		r := big.Int{}
		s := big.Int{}
		sigLen := len(vin.Signature)
		r.SetBytes(vin.Signature[:sigLen/2])
		s.SetBytes(vin.Signature[sigLen/2:])

		// 解析公鑰
		x := big.Int{}
		y := big.Int{}
		keyLen := len(vin.PubKey)
		x.SetBytes(vin.PubKey[:keyLen/2])
		y.SetBytes(vin.PubKey[keyLen/2:])

		rawPubKey := ecdsa.PublicKey{Curve: curve, X: &x, Y: &y}
		if !ecdsa.Verify(&rawPubKey, dataToVerify, &r, &s) {
			return false
		}

		txCopy.Vin[inIdx].PubKey = nil
	}
	return true
}
```

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

這個流程串聯了前面學到的所有密碼學元件：橢圓曲線產生金鑰對、hash 函數壓縮公鑰、Base58 編碼產生人類可讀地址。每一步都不可逆——從地址無法推導公鑰，從公鑰無法推導私鑰。

```go
// 錢包結構
type Wallet struct {
	PrivateKey ecdsa.PrivateKey
	PublicKey  []byte
}

// 建立新錢包
func NewWallet() *Wallet {
	private, public := NewKeyPair()
	return &Wallet{PrivateKey: private, PublicKey: public}
}

// 從公鑰推導地址
func (w *Wallet) GetAddress() []byte {
	// Step 1: SHA256 + RIPEMD160
	pubKeyHash := HashPubKey(w.PublicKey)

	// Step 2: 加版本前綴（0x00 = mainnet）
	versionedPayload := append([]byte{0x00}, pubKeyHash...)

	// Step 3: 計算 checksum
	checksum := Checksum(versionedPayload)

	// Step 4: 拼接並 Base58 編碼
	fullPayload := append(versionedPayload, checksum...)
	address := Base58Encode(fullPayload)

	return address
}

func HashPubKey(pubKey []byte) []byte {
	publicSHA256 := sha256.Sum256(pubKey)

	RIPEMD160Hasher := ripemd160.New()
	_, _ = RIPEMD160Hasher.Write(publicSHA256[:])
	publicRIPEMD160 := RIPEMD160Hasher.Sum(nil)

	return publicRIPEMD160
}
```

```text
地址生成完整流程圖：

  Private Key (32 bytes, 隨機生成)
       │
       │  橢圓曲線乘法 (不可逆)
       v
  Public Key (65 bytes, uncompressed)
       │
       │  SHA256
       v
  SHA256(PubKey) (32 bytes)
       │
       │  RIPEMD160
       v
  PubKeyHash (20 bytes)
       │
       │  加版本前綴 (0x00)
       v
  Version + PubKeyHash (21 bytes)
       │
       │  雙重 SHA256，取前 4 bytes
       v
  Checksum (4 bytes)
       │
       │  拼接
       v
  Version + PubKeyHash + Checksum (25 bytes)
       │
       │  Base58 編碼
       v
  Bitcoin Address (如: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)
```

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

以下是完整的端到端測試場景：

```go
func TestFullFlow(t *testing.T) {
	// 1. 建立錢包
	walletA := NewWallet()
	walletB := NewWallet()
	addrA := string(walletA.GetAddress())
	addrB := string(walletB.GetAddress())

	// 2. 建立區塊鏈（genesis block 獎勵給 A）
	bc := NewBlockchain(addrA)
	defer bc.db.Close()
	utxoSet := UTXOSet{bc}
	utxoSet.Reindex()

	// 3. 驗證 A 的初始餘額
	balA := utxoSet.GetBalance(HashPubKey(walletA.PublicKey))
	assert.Equal(t, 50, balA) // 假設獎勵 50

	// 4. A 向 B 轉帳 30
	tx, err := NewTransaction(addrA, addrB, 30, &utxoSet, wallets)
	assert.NoError(t, err)

	// 5. 打包出塊
	newBlock := bc.MineBlock([]*Transaction{tx})

	// 6. 更新 UTXO 集
	utxoSet.Update(newBlock)

	// 7. 驗證餘額
	balA = utxoSet.GetBalance(HashPubKey(walletA.PublicKey))
	balB := utxoSet.GetBalance(HashPubKey(walletB.PublicKey))

	// A: 50 (coinbase) - 30 (轉帳) = 20 (找零)
	// 加上新區塊的 coinbase 獎勵（如果 A 是礦工）
	assert.Equal(t, 20, balA) // 不含新 coinbase
	assert.Equal(t, 30, balB)

	// 8. 驗證交易簽名
	assert.True(t, tx.Verify(prevTXs))
}
```

```text
完整流程時序圖：

Time ──────────────────────────────────────────────>

Block 0 (Genesis):              Block 1:
┌──────────────────────┐        ┌──────────────────────┐
│ Coinbase -> A: 50    │        │ Coinbase -> A: 50    │
│                      │        │ A -> B: 30           │
│                      │        │ A -> A: 20 (找零)    │
└──────────────────────┘        └──────────────────────┘

UTXO 集變化：
Block 0 後: {A: [50]}
Block 1 後: {A: [50(新coinbase), 20(找零)], B: [30]}
```

## 章節回顧與工程要點

本章完成了一條簡化但完整的區塊鏈實作。以下是每個模組的核心工程知識和需要銘記的設計決策：

**核心資料結構**：區塊、交易、UTXO 三者的結構定義決定了整條鏈的能力邊界。序列化的穩定性是 hash 一致性的基礎，永遠使用 binary encoding 而非 JSON。區塊 header 與交易資料分離，通過 Merkle Root 連接，這個設計支撐了 SPV 輕節點的可行性。

**PoW 出塊與驗證流程**：挖礦的計算成本和驗證的低成本形成了非對稱性，這是 PoW 安全的根本。驗證必須重算 header hash，絕不信任對方聲稱的 hash 值。挖礦過程需要能被中斷（當新區塊到達時），否則會浪費算力。

**UTXO 交易與地址生成**：UTXO 模型的核心是「消費舊輸出、產生新輸出」。找零是最容易出錯的環節——忘記產生找零等於把剩餘金額當手續費送給了礦工。地址生成串聯了橢圓曲線、hash 函數、Base58 三個密碼學元件，每一步都不可逆。

**DB 持久化與遍歷**：bbolt 的 ACID 事務保證了寫入的原子性。UTXO 集合索引是效能的關鍵——沒有它，每次查餘額都需要遍歷整條鏈。區塊鏈遍歷從最新區塊沿 PrevHash 反向走到 genesis。

## 白話總結

這一章就是帶你從零開始造一條能跑的區塊鏈。首先你得把 hash、Base58、Merkle Tree 這些密碼學工具都用 Go 實作出來，這些是區塊鏈的「零件」。然後你把這些零件組裝成區塊和交易的資料結構，用 PoW 讓區塊不能被隨便偽造。UTXO 模型是最燒腦的部分，你得理解「餘額」其實不存在，存在的只是一堆散落的「未花費輸出」。發交易就是選幾個舊的輸出消耗掉，然後產生新的輸出——一定要記得找零，不然剩下的錢就白送給礦工了。最後用 bbolt 把所有資料存到硬碟上。做完這些，你手上就有一條能生成地址、發送交易、挖礦出塊、驗證簽名的完整簡化鏈了。

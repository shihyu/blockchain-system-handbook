// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded "><a href="index.html"><strong aria-hidden="true">1.</strong> 封面與閱讀方式</a></li><li class="chapter-item expanded "><a href="01-system-map.html"><strong aria-hidden="true">2.</strong> 1. 系統全圖與分層</a></li><li class="chapter-item expanded "><a href="02-chain-models.html"><strong aria-hidden="true">3.</strong> 2. 鏈類型與設計取捨</a></li><li class="chapter-item expanded "><a href="03-consensus-finality.html"><strong aria-hidden="true">4.</strong> 3. 共識、最終性與重組</a></li><li class="chapter-item expanded "><a href="04-data-network-structure.html"><strong aria-hidden="true">5.</strong> 4. 網路、資料與節點結構</a></li><li class="chapter-item expanded "><a href="05-wallet-keys-signing.html"><strong aria-hidden="true">6.</strong> 5. 錢包、金鑰與簽名流程</a></li><li class="chapter-item expanded "><a href="06-transaction-lifecycle.html"><strong aria-hidden="true">7.</strong> 6. 交易生命週期與 Gas 市場</a></li><li class="chapter-item expanded "><a href="07-smart-contract-runtime.html"><strong aria-hidden="true">8.</strong> 7. 智能合約執行模型</a></li><li class="chapter-item expanded "><a href="08-l1-l2-bridges.html"><strong aria-hidden="true">9.</strong> 8. L1/L2/跨鏈與橋接</a></li><li class="chapter-item expanded "><a href="09-defi-primitives.html"><strong aria-hidden="true">10.</strong> 9. DeFi 原語與組合性</a></li><li class="chapter-item expanded "><a href="10-multisig-and-governance.html"><strong aria-hidden="true">11.</strong> 10. 多簽、金庫與治理結構</a></li><li class="chapter-item expanded "><a href="11-security-and-attacks.html"><strong aria-hidden="true">12.</strong> 11. 攻擊面、事故型態與防禦</a></li><li class="chapter-item expanded "><a href="12-observability-devops.html"><strong aria-hidden="true">13.</strong> 12. 監控、SRE 與工程交付</a></li><li class="chapter-item expanded "><a href="13-reference-architectures.html"><strong aria-hidden="true">14.</strong> 13. 參考架構藍圖</a></li><li class="chapter-item expanded "><a href="14-checklists.html"><strong aria-hidden="true">15.</strong> 14. 上線與稽核檢查清單</a></li><li class="chapter-item expanded "><a href="15-glossary.html"><strong aria-hidden="true">16.</strong> 15. 術語與快速索引</a></li><li class="chapter-item expanded "><a href="16-utxo-deep-dive.html"><strong aria-hidden="true">17.</strong> 16. UTXO / EUTXO 全面深潛</a></li><li class="chapter-item expanded "><a href="part-2-blockchain-tech.html"><strong aria-hidden="true">18.</strong> 第2篇 區塊鏈技術篇</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch04-first-look-blockchain.html"><strong aria-hidden="true">18.1.</strong> 第4章 初識區塊鏈</a></li><li class="chapter-item expanded "><a href="ch05-blockchain-principles.html"><strong aria-hidden="true">18.2.</strong> 第5章 區塊鏈的技術原理</a></li><li class="chapter-item expanded "><a href="ch06-blockchain-trends.html"><strong aria-hidden="true">18.3.</strong> 第6章 區塊鏈技術的發展趨勢</a></li></ol></li><li class="chapter-item expanded "><a href="part-3-blockchain-dev.html"><strong aria-hidden="true">19.</strong> 第3篇 區塊鏈開發篇</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch07-solidity-intro.html"><strong aria-hidden="true">19.1.</strong> 第7章 Solidity智能合約開發入門</a></li><li class="chapter-item expanded "><a href="ch08-solidity-advanced.html"><strong aria-hidden="true">19.2.</strong> 第8章 Solidity智能合約開發進階</a></li><li class="chapter-item expanded "><a href="ch09-python-offline-wallet.html"><strong aria-hidden="true">19.3.</strong> 第9章 Python語言離線錢包開發</a></li></ol></li><li class="chapter-item expanded "><a href="part-4-go-practice.html"><strong aria-hidden="true">20.</strong> 第4篇 Go語言區塊鏈實作篇</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="go-ch03-principles-development-apps.html"><strong aria-hidden="true">20.1.</strong> 第3章 區塊鏈原理、發展與應用</a></li><li class="chapter-item expanded "><a href="go-ch04-basic-dev.html"><strong aria-hidden="true">20.2.</strong> 第4章 Go語言區塊鏈初級應用開發</a></li><li class="chapter-item expanded "><a href="go-ch05-advanced-dev.html"><strong aria-hidden="true">20.3.</strong> 第5章 Go語言區塊鏈高級應用開發</a></li><li class="chapter-item expanded "><a href="go-ch06-offline-wallet.html"><strong aria-hidden="true">20.4.</strong> 第6章 Go語言離線錢包開發</a></li></ol></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString().split("#")[0].split("?")[0];
        if (current_page.endsWith("/")) {
            current_page += "index.html";
        }
        var links = Array.prototype.slice.call(this.querySelectorAll("a"));
        var l = links.length;
        for (var i = 0; i < l; ++i) {
            var link = links[i];
            var href = link.getAttribute("href");
            if (href && !href.startsWith("#") && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The "index" page is supposed to alias the first chapter in the book.
            if (link.href === current_page || (i === 0 && path_to_root === "" && current_page.endsWith("/index.html"))) {
                link.classList.add("active");
                var parent = link.parentElement;
                if (parent && parent.classList.contains("chapter-item")) {
                    parent.classList.add("expanded");
                }
                while (parent) {
                    if (parent.tagName === "LI" && parent.previousElementSibling) {
                        if (parent.previousElementSibling.classList.contains("chapter-item")) {
                            parent.previousElementSibling.classList.add("expanded");
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                sessionStorage.setItem('sidebar-scroll', this.scrollTop);
            }
        }, { passive: true });
        var sidebarScrollTop = sessionStorage.getItem('sidebar-scroll');
        sessionStorage.removeItem('sidebar-scroll');
        if (sidebarScrollTop) {
            // preserve sidebar scroll position when navigating via links within sidebar
            this.scrollTop = sidebarScrollTop;
        } else {
            // scroll sidebar to current active section when navigating via "next/previous chapter" buttons
            var activeSection = document.querySelector('#sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        var sidebarAnchorToggles = document.querySelectorAll('#sidebar a.toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(function (el) {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define("mdbook-sidebar-scrollbox", MDBookSidebarScrollbox);

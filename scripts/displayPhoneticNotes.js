(function(){
	/******************************查选择文本的拼音******************/
	let cachedSelectedText = ''; // 已选择的文本
	let cachedSeclectedRect = null;
	// 标记：是否是用户主动选择文本
	let userSelectActive = false;
	let dictLoading = false; // 加载拼音数据的全局锁
	let floatBtn;

	/** 响应selectionchange事件，控制拼音按钮显隐，并缓存选择的文本
     *  Calibre阅读器发生选择文本变化时，会弹出自身控件，这时网页元素不能再响应
	 *	事件，所以只能将选择文本缓存起来，先点击一次使阅读器自身控件消失，再点击
	 *  拼音按钮显示拼音
	 */
	function handleSelection() {
		const sel = window.getSelection();
		const currentText = sel.toString();
		// 判断：当前存在非空选区 → 用户选中文字，更新缓存
		if (currentText.trim() !== '') {
			cachedSelectedText = currentText;
			userSelectActive = true;

			// 获取选区包围盒
			if (sel.rangeCount > 0) {
				const range = sel.getRangeAt(0);
				const rect = range.getBoundingClientRect();
				cachedSeclectedRect = rect;
				// 先让按钮显示，才能拿到自身宽高
				floatBtn.style.display = 'block';
				placeEle(floatBtn, cachedSeclectedRect) ;
			}
		} else {
			// currentText为空：区分两种场景
			// 如果userSelectActive=true：说明是Calibre原生控件点击导致清空选区，不覆盖cachedSelectedText！
			// 只重置标记，保留缓存的文字
			if (userSelectActive) {
				// 不执行 cachedSelectedText = '';保留上次选中内容
				userSelectActive = false;
			} else {
				// 本来就没有选区，清空缓存
				cachedSelectedText = '';
				cachedSeclectedRect = null;
			}
		}
	}

	function placeEle(ele, anchorRect) {
		const eleH = ele.offsetHeight;
		const eleW = ele.offsetWidth;
		const gap = 6; // 和选区之间的间距
		let top, left;

		// 优先放选区下方
		if (anchorRect.bottom + gap + eleH <= window.innerHeight) {
			top = anchorRect.bottom + gap;
		} else {
			// 下方放不下，放到选区上方
			top = anchorRect.top - gap - eleH;
			// 防止贴到上边视口外面
			if (top < 4) top = 4;
		}
		// 水平对齐选区左边缘，不越出视口右侧
		left = anchorRect.left - (eleW - anchorRect.width) / 2;
		if (left + eleW > window.innerWidth) {
			left = window.innerWidth - eleW - 4;
		}
		// 防止贴到左边视口外面
		if (left < 4) left = 4;
		ele.style.top = top + 'px';
		ele.style.left = left + 'px';
	}

	/**
	 * @param {string} selectedText 用户选中的文本
	 * @returns {string} 拼装好的带ruby的HTML
	 */
	function renderPinyinHtml(selectedText) {
		const txt = selectedText.normalize('NFC');
		const phraseMap = window.__PHRASES_MAP__;
		const charMap = window.__PHONETIC_MAP__;
		let htmlOut = '';

		// 1. 选择文本长度>1，优先查词语字典，查不到逐字处理
		if (txt.length > 1) {
			if (phraseMap[txt]) {
				// 1.1词语匹配成功：不存在多音字
				const pyList = phraseMap[txt];
				// 遍历：汉字、拼音一一配对
				for(let i=0; i<txt.length; i++){
					const ch = txt[i];
					const py = pyList[i];
					htmlOut += `<ruby>${ch}<rt>${py}\u00A0</rt></ruby>\u00A0`;
				}
				return htmlOut;
			}
			// 1.2. 词语没找到，逐字处理，为了美观多音字只取排第一的拼音
			for (const ch of txt) {
				const cp = ch.codePointAt(0);
				const pyStr = charMap[ch];
				if (pyStr) {
					const py = pyStr.split(',')[0];
					htmlOut += `<ruby>${ch}<rt>${py}\u00A0</rt></ruby>\u00A0`;
				} else {
					htmlOut += ch;
				}
			}
			return htmlOut;
		}

		// 2. 选择文本只有单个字：多音字标注出所有拼音
		const pyStr = charMap[txt].replace(',', ' / ');
		if (pyStr) {
			htmlOut += `<ruby>${txt}<rt>${pyStr}</rt></ruby>`;
		} else {
			htmlOut += txt;
		}
		return htmlOut;
	}

	function ensureStyle() {
		if (!document.querySelector('#phonetic-style')) {
				const style = document.createElement('style');
				style.id = 'phonetic-style';
				style.textContent = `
				#note‑overlay {
					position:fixed;
					inset:0;
					background:rgba(0,0,0,0.55);
					z-index:2147483647;
					align-items:center;
					justify-content:center;
					padding:16px;
					box-sizing:border-box;
					display:none;
				}
				#note‑popup‑box {
					background:#fff;
					color:#000;
					max-width:85vw;
					max-height:80vh;
					width:min(32em, 85vw);
					overflow:auto;
					border-radius:8px;
					padding:14px;
					box-sizing:border-box;
					box-shadow:0 4px 14px rgba(0,0,0,0.3);
				}
				#note‑popup‑box button {
					float:right;
					border:none;
					background:#f00;
					color:#fff;
					border-radius:4px;
					padding:3px 8px;
					cursor:pointer;
					margin-bottom:8px;
				}
				#pinyin-float-btn {
					user-select: none;
					-webkit-user-select: none;
					display: none;
					position:fixed;
				  padding:4px 8px;
				  background:#f00;
				  color:#fff;
				  border:none;
				  border-radius:4px;
				  font-size:14px;
				  pointer-events:auto;
				  display:none;
				  z-index:2147483647;
				}
				ruby {
					ruby-position: over;
				}
				rt {
					font-size: 0.8em;
					line-height: 1.5;
					color: red;
				}`;
				(document.head || document.documentElement).appendChild(style);
			}
	}

	function init() {
		ensureStyle();		
		window.dualAnnoLayout.activate('.dual-layout', { annoClass: "anno" });
		const noteOverlay = document.createElement('div');
		noteOverlay.id = 'note‑overlay';

		// 创建弹窗盒子
		const notePopup = document.createElement('div');
		notePopup.id = 'note‑popup‑box';

		// 关闭按钮
		const closeBtn = document.createElement('button');
		closeBtn.textContent = '\u00D7';

		const noteContentWrap = document.createElement('div');
		noteContentWrap.className = 'note‑content';

		notePopup.appendChild(closeBtn);
		notePopup.appendChild(noteContentWrap);
		noteOverlay.appendChild(notePopup);
		document.body.appendChild(noteOverlay);

		// 关闭弹窗函数
		function closeNotePopup() {
			noteOverlay.style.display = 'none';
			noteContentWrap.innerHTML = '';
		}

		closeBtn.addEventListener('click', closeNotePopup);
		// 点击遮罩背景关闭，点击弹窗内部不关闭
		noteOverlay.addEventListener('click', function(e) {
			if (e.target === noteOverlay) {
				closeNotePopup();
			}
		});
		// HTML页面中已经有拼音按钮则取消下面一行的注释
		floatBtn = document.getElementById('pinyin-float-btn');
		// 不存在则创建按钮
		if (!floatBtn) {
			floatBtn = document.createElement('button');
			floatBtn.id = 'pinyin-float-btn';
			floatBtn.textContent = '\u62fc\u97f3'; // 拼音
			document.body.appendChild(floatBtn);
		}
		// =========事件委托：监听整个document，适配Calibre翻页重建DOM，不需要重复绑定=========
		document.addEventListener('click', function(e) {
			// 优先级1：判断是否点击拼音按钮
			const targetBtn = e.target.closest('button#pinyin-float-btn');		
			if (targetBtn) {
				e.preventDefault();
				e.stopPropagation();				
				targetBtn.style.display = 'none';
				if (!cachedSelectedText.trim()) return;

				noteContentWrap.innerHTML = renderPinyinHtml(cachedSelectedText);
				noteOverlay.style.display = 'flex';
				placeEle(noteOverlay, cachedSeclectedRect);
				return;
			}
			// 优先级2：判断是否点击脚注引用 a.noteref
			const refEl = e.target.closest('a.noteref');
			if (refEl) {
				e.preventDefault();
				e.stopPropagation();
				const targetId = refEl.getAttribute('data-href');
				const aside = document.getElementById(targetId);
				if (!aside) {
					console.warn(`脚注目标ID【${targetId}】未找到！Calibre分页可能已经移除该DOM。`);
					return;
				}
				noteContentWrap.innerHTML = aside.innerHTML;
				noteOverlay.style.display = "flex";
				return;
			}
		});

		let timer;
		document.addEventListener('selectionchange', () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				// 选区稳定后执行一次
				handleSelection();
			}, 200);
		});

	}

	function whenDOMReady(callback) {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', callback, { once: true });
		} else {
			callback();
		}
	}

	whenDOMReady(init);
})();

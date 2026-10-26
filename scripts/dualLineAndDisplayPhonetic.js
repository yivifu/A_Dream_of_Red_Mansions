/* 防止EPUB阅读器发生变量重定义错误，全部代码在闭包中运行，不同页面中的变量都是局部变量，互不干扰*/
(function() {
	class DualAnnoLayout {
		constructor(element, option = {}) {
			this.element = element;
			this.container = document.querySelector('.story'); // 页面顶层容器
			this.originalHTML = element.innerHTML;
			this.noHeading = option.noHeading || '!%),.:;>?]}¢¨°·ˇˉ―‖’”…‰′″›℃∶、。〃〉》」』】〕〗〞︶︺︾﹀﹄﹚﹜﹞！＂％＇），．：；？］｀｜｝～￠，？’';
			this.noTailing = option.noTailing || '$([{£¥·‘“〈《「『【〔〖〝﹙﹛﹝＄（．［｛￡￥';
			this.minAnnoChars = option.minAnnoChars || 2;
			this.rightAdjust = option.rightAdjust || 5;
			this.annoClass = option.annoClass || 'annotation';
			this.annoRatio = 0.8;  // 与CSS需保持一致，例如CSS夹批font-size为0.8em，则此处为0.8
			this.moveForIlleChar = option.moveForIlleChar || 3;
			this.ctx = document.createElement('canvas').getContext('2d');
			this.charIndexCache = new WeakMap();
			this.ticking = false;

			if (!this.hasAnnotation()) return;  // 不处理无批注段落很难保持格式的一致性
			this.init();
		}
 		// CSS中注意与未经处理的无批注段落保持格式的一致性
		hasAnnotation() {
			const temp = document.createElement('div');
			temp.innerHTML = this.originalHTML;
			return temp.querySelector(`.${this.annoClass}`) !== null;
		}

		init() {
			window.addEventListener('resize', () => {
				if (!this.ticking) {
					requestAnimationFrame(() => {
						this.render();
						this.ticking = false;
					});
					this.ticking = true;
				}
			});
			this.render();
		}

		updateMaxWidth() {
			const style = window.getComputedStyle(this.container);
			const rect = this.container.getBoundingClientRect();
			this.maxWidth = rect.width - this.getHorizontalExtraWidth(this.container) - this.rightAdjust;
		}

		measureTextWidth(text, element, annoClass, annoRatio) {
			if (!text) return 0;
			function getNonHanziArr(str) {
    		// 匹配任意一个不是汉字的字符
    		const nonHanziReg = /[^\u4E00-\u9FFF]/g;
    		return str.match(nonHanziReg) || [];
			}
			function countNonHanzi(str) {
    		return getNonHanziArr(str).length;
			}
			const style = window.getComputedStyle(element);
			this.ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
			this.ctx.letterSpacing = style.letterSpacing;
			if (element.classList.contains(annoClass)) {
				const extraCharCount = countNonHanzi(text); // 补上夹批中标点符号的调整值，须根据字体的实际效果试验
				const adjust = text.length > 20 ? extraCharCount * 20: extraCharCount * 16;
				return this.ctx.measureText(text).width * annoRatio + adjust;
			}
			return this.ctx.measureText(text).width;
		}

		buildCharIndexMap(element) {// 先查缓存，命中则直接返回
			if (this.charIndexCache.has(element)) {
				return this.charIndexCache.get(element);
			}
			const map = new Map();
			let acc = 0;
			const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
			let node;
			while (node = walker.nextNode()) {
				if (node.textContent.length > 0) {
					map.set(node, acc);
					acc += node.textContent.length;
				}
			}
			// 存入缓存
			this.charIndexCache.set(element, map);
			return map;
		}

		insertBrAtGlobalIndex(element, globalIndex, charIndexMap) {
			for (let [node, start] of charIndexMap) {
				const end = start + node.textContent.length;
				if (globalIndex >= start && globalIndex <= end) {
					const parent = node.parentNode;
					if (!parent) return false;
					let br;
					if (globalIndex === start) {
						br = document.createElement('br');
						parent.insertBefore(br, node);
					} else if (globalIndex === end) {
						br = document.createElement('br');
						parent.insertBefore(br, node.nextSibling);
					} else {
						let offset = globalIndex - start;
						let moved = 0;
						const text = node.textContent;
						while (moved < this.moveForIlleChar && offset < end && this.noHeading.includes(text[offset])) {
							offset++;
							moved++;
						}
						const before = text.slice(0, offset);
						const after = text.slice(offset);
						const beforeNode = document.createTextNode(before);
						const afterNode = document.createTextNode(after);
						br = document.createElement('br');
						parent.insertBefore(beforeNode, node);
						parent.insertBefore(br, node);
						parent.insertBefore(afterNode, node);
						parent.removeChild(node);
					}
					let hasTextBefore = false;
					let prev = br.previousSibling;
					while (prev) {
						if (prev.nodeType === Node.TEXT_NODE && prev.textContent.trim()) {
							hasTextBefore = true;
							break;
						}
						prev = prev.previousSibling;
					}
					if (!hasTextBefore) {
						parent.insertBefore(document.createTextNode('\u00A0'), br);
					}
					let hasTextAfter = false;
					let next = br.nextSibling;
					while (next) {
						if (next.nodeType === Node.TEXT_NODE && next.textContent.trim()) {
							hasTextAfter = true;
							break;
						}
						next = next.nextSibling;
					}
					if (!hasTextAfter) {
						parent.insertBefore(document.createTextNode('\u00A0'), br.nextSibling);
					}
					return element;
				}
			}
			return null;
		}

		extractFragment(element, startChar, endChar, charIndexMap) {
			const startPos = this.getNodeAndOffset(startChar, charIndexMap);
			const endPos = this.getNodeAndOffset(endChar, charIndexMap);
			if (!startPos || !endPos) return null;
			const range = document.createRange();
			range.setStart(startPos.node, startPos.offset);
			range.setEnd(endPos.node, endPos.offset);
			const fragment = range.cloneContents();
			return fragment;
		}

		getNodeAndOffset(charIndex, charIndexMap) {
			for (let [node, start] of charIndexMap) {
				const text = node.textContent;
				const end = start + text.length;
				// 正文中元素内容的避行首行尾非法字符处理
				if (charIndex >= start && charIndex <= end) {
					return { node, offset: charIndex - start };
				}
			}
			return null;
		}

		getSubWidth(element, startIdx, endIdx, charIndexMap) {
			if (startIdx >= endIdx) return 0;
			let total = 0;
			for (let [node, nodeStart] of charIndexMap) {
				const nodeEnd = nodeStart + node.textContent.length;
				if (nodeEnd <= startIdx) continue;
				if (nodeStart >= endIdx) break;
				const sliceStart = Math.max(0, startIdx - nodeStart);
				const sliceEnd = Math.min(node.textContent.length, endIdx - nodeStart);
				if (sliceEnd > sliceStart) {
					const textSlice = node.textContent.slice(sliceStart, sliceEnd);
					const parentForStyle = node.parentElement || element;
					total += this.measureTextWidth(textSlice, parentForStyle, this.annoClass, this.annoRatio);
				}
			}
			return total;
		}

		getWidthUpTo(n, elem, charMap = null) {
			const map = charMap || this.buildCharIndexMap(elem);
			return this.getSubWidth(elem, 0, n, map);
		}

		splitElementByCharIndex(originalElem, splitIdx) {
			const totalLen = originalElem.textContent.length;
			if (splitIdx <= 0) return { front: null, back: originalElem.cloneNode(true) };
			if (splitIdx >= totalLen) return { front: originalElem.cloneNode(true), back: null };

			const charMap = this.buildCharIndexMap(originalElem);

			const startPos = this.getNodeAndOffset(0, charMap);
			const endPosFront = this.getNodeAndOffset(splitIdx, charMap);
			const endPosTotal = this.getNodeAndOffset(totalLen, charMap);
			if (!startPos || !endPosFront || !endPosTotal) {
				return { front: originalElem.cloneNode(true), back: null };
			}

			const rangeFront = document.createRange();
			rangeFront.setStart(startPos.node, startPos.offset);

			const rangeBack = document.createRange();
			rangeBack.setStart(endPosFront.node, endPosFront.offset);
			rangeBack.setEnd(endPosTotal.node, endPosTotal.offset);
			// 避免下行行首出现非法字符
			const text = rangeBack.toString();
			let moved = 0;
			while (moved < this.moveForIlleChar && moved < text.length && this.noHeading.includes(text[moved])) {
				moved++;
				endPosFront.offset++;
			}
			rangeFront.setEnd(endPosFront.node, endPosFront.offset);
			rangeBack.setStart(endPosFront.node, endPosFront.offset);
			const frontFrag = rangeFront.cloneContents();
			const backFrag = rangeBack.cloneContents();

			const cloneWithAttrs = (elem) => {
				const clone = document.createElement(elem.tagName);
				for (let i = 0; i < elem.attributes.length; i++) {
					const attr = elem.attributes[i];
					clone.setAttribute(attr.name, attr.value);
				}
				if (elem.style && elem.style.cssText) clone.style.cssText = elem.style.cssText;
				return clone;
			};

			const frontElem = cloneWithAttrs(originalElem);
			const backElem = cloneWithAttrs(originalElem);
			frontElem.appendChild(frontFrag);
			backElem.appendChild(backFrag);
			return { front: frontElem, back: backElem };
		}

		splitElementByWidth(elem, remainWidth, extraWidth) {
			const totalLen = elem.textContent.length;
			if (totalLen === 0) return { fitted: null, rest: null, usedWidth: 0 };

			const fullWidth = this.getWidthUpTo(elem.textContent.length, elem) + extraWidth;
			if (fullWidth <= remainWidth) {
				return { fitted: elem.cloneNode(true), rest: null, usedWidth: fullWidth };
			}

			let low = 0, high = totalLen, bestLen = 0;
			const charMap = this.buildCharIndexMap(elem);
			while (low <= high) {
				const mid = Math.floor((low + high) / 2);
				const width = this.getSubWidth(elem, 0, mid, charMap) + extraWidth;
				if (width <= remainWidth) {
					bestLen = mid;
					low = mid + 1;
				} else {
					high = mid - 1;
				}
			}
			if (bestLen === 0) bestLen = 1;

			const { front, back } = this.splitElementByCharIndex(elem, bestLen);
			const usedWidth = front ? (this.getWidthUpTo(front.textContent.length, front) + extraWidth) : 0;
			return { fitted: front, rest: back, usedWidth: usedWidth };
		}

		getDualWidthAndSplit(annoElem, n, noHeading, remainW) {
			const fullText = annoElem.textContent;
			// 分割点n处如果是非法行首字符，移动不超过this.moveForIlleChar个字符调整分割点避开非法行首字符
			let moved = 0;
			while (moved < this.moveForIlleChar && n < fullText.length && noHeading.includes(fullText[n])) {
				n++;
				moved++;
			}
			const sub = fullText.slice(0, n);
			if (sub.length === 0) return { width: 0, split: 0 };
			let bestSplit = Math.floor(sub.length / 2);
			if (bestSplit < 1) bestSplit = 1;

			const totalW = this.getWidthUpTo(n, annoElem);
			let minS = 1;
			for (let s = 1; s < sub.length; s++) {
				const wb = totalW - this.getWidthUpTo(s, annoElem);
				if (wb <= remainW) {
					minS = s;
					break;
				}
			}
			let maxS = sub.length - 1;
			for (let s = sub.length - 1; s >= minS; s--) {
				const wa = this.getWidthUpTo(s, annoElem);
				if (wa <= remainW) {
					maxS = s;
					break;
				}
			}
			bestSplit = Math.ceil((minS + maxS) / 2);
			const w1 = this.getWidthUpTo(bestSplit, annoElem);
			const w2 = totalW - w1;
			return { width: Math.max(w1, w2), split: bestSplit };
		}

		measureTextFit(text, element, maxWidth) {
			if (!text) return 0;
			let left = 0, right = text.length, fit = 0;
			while (left <= right) {
				const mid = Math.floor((left + right) / 2);
				const w = this.measureTextWidth(text.slice(0, mid), element, this.annoClass, this.annoRatio);
				if (w <= maxWidth) {
					fit = mid;
					left = mid + 1;
				} else {
					right = mid - 1;
				}
			}
			return fit;
		}

		getHorizontalExtraWidth(element) {
			const style = window.getComputedStyle(element);
			const paddingLeft = parseFloat(style.paddingLeft) || 0;
			const paddingRight = parseFloat(style.paddingRight) || 0;
			const marginLeft = parseFloat(style.marginLeft) || 0;
			const marginRight = parseFloat(style.marginRight) || 0;
			const borderLeft = parseFloat(style.borderLeftWidth) || 0;
			const borderRight = parseFloat(style.borderRightWidth) || 0;
			return (paddingLeft + paddingRight + borderLeft + borderRight + marginLeft + marginRight);
		}

		// 2. Render：混合处理
		render() {
			this.updateMaxWidth();
			if (!document.querySelector('#anno-style')) {
				const style = document.createElement('style');
				style.id = 'anno-style';
				style.textContent = `.${this.annoClass} { display: inline-block !important; vertical-align: middle; margin: 1px; padding: 1px; line-height: 1.4; } .line { white-space: nowrap !important; overflow: visible !important; }`;
				document.head.appendChild(style);
			}
			if (this.maxWidth <= 0) return;

			this.element.innerHTML = this.originalHTML;
			this.renderPara(this.element);
		}

		renderPara(para) {
			const items = [];
			for (let child of para.childNodes) {
				if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
					items.push({ type: 'text', node: child, parent: child.parentElement });
				} else if (child.nodeType === Node.ELEMENT_NODE) {
					if (child.classList.contains(this.annoClass)) {
						items.push({ type: 'anno', node: child });
					} else {
						items.push({ type: 'element', node: child });
					}
				}
			}

			let lines = [];
			let lineDiv = document.createElement('div');
			lineDiv.className = 'line';
			lineDiv.style.width = `${this.maxWidth - this.rightAdjust}px`;
			let remainW = this.maxWidth;
			// 首行减去左缩进的两个字符宽度，约16（body的font-size）*1.2（.dual-line的1.2em）*2
			if(lines.length === 0) remainW = remainW - 38;
			while (items.length > 0) {
				const item = items.shift();
				if (item.type === 'text') {
					let textNode = item.node;
					let text = textNode.textContent;
					// 每行开头的非法行首字符全部插入上一行末尾
					if (lineDiv.textContent.length === 0) {
						let illegalLeadding = "", i = 0;
						while (i < text.length && this.noHeading.includes(text[i])) {
							illegalLeadding += text[i];
							i++;
						}
						if (i > 0) {
							const tmpNode = document.createTextNode(illegalLeadding);
							/*if(paraFrag.lastChild)
								paraFrag.lastChild.appendChild(tmpNode);
							else
								paraFrag.appendChild(tmpNode);*/
							lineDiv.appendChild(tmpNode);
							text = text.slice(i);
							textNode = document.createTextNode(text);
						}
					}
					const fullWidth = this.measureTextWidth(text, item.parent, this.annoClass, this.annoRatio);
					if (fullWidth <= remainW) {
						remainW -= fullWidth;
						lineDiv.appendChild(textNode.cloneNode(true));
					} else {
						let fitChars = this.measureTextFit(text, item.parent, remainW);
						if (fitChars === 0) {
							// 换行
							lines.push(lineDiv);
							lineDiv = document.createElement('div');
							lineDiv.className = 'line';
							lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
							remainW = this.maxWidth;
							items.unshift(item);
							continue;
						}
						// 调整 fitChars 以避免行首行尾出现不合适的标点
						while (fitChars > 0 && this.noTailing.includes(text[fitChars - 1])) fitChars--;
						while (fitChars < text.length && this.noHeading.includes(text[fitChars])) fitChars++;
						if (fitChars === 0) fitChars = 1;
						const fitText = text.slice(0, fitChars);
						const restText = text.slice(fitChars);
						const fittedSpan = document.createElement('span');
						fittedSpan.textContent = fitText;
						lineDiv.appendChild(fittedSpan);
						remainW -= this.measureTextWidth(fitText, item.parent, this.annoClass, this.annoRatio);
						if (restText) {
							const restNode = document.createTextNode(restText);
							items.unshift({ type: 'text', node: restNode, parent: item.parent });
						}
						// 换行
						lines.push(lineDiv);
						lineDiv = document.createElement('div');
						lineDiv.className = 'line';
						lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
						remainW = this.maxWidth;
					}
				} else if (item.type === 'element') {
					const elem = item.node;
					const extraWidth = this.getHorizontalExtraWidth(elem);
					const effectiveRemain = remainW - extraWidth;
					if (effectiveRemain <= 0) {
						// 换行
						lines.push(lineDiv);
						lineDiv = document.createElement('div');
						lineDiv.className = 'line';
						lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
						remainW = this.maxWidth;
						items.unshift(item);
						continue;
					}
					const { fitted, rest, usedWidth } = this.splitElementByWidth(elem, effectiveRemain, extraWidth);
					if (fitted) {
						lineDiv.appendChild(fitted);
						remainW -= usedWidth;
					}
					if (rest) {
						items.unshift({ type: 'element', node: rest });
						// 换行
						lines.push(lineDiv);
						lineDiv = document.createElement('div');
						lineDiv.className = 'line';
						lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
						remainW = this.maxWidth;
					}
				} else if (item.type === 'anno') {
					const annoElem = item.node;
					const fullText = annoElem.textContent;
					if (!fullText.trim()) continue;
					const extraWidth = this.getHorizontalExtraWidth(annoElem);
					const effectiveRemain = remainW - extraWidth;
					if (effectiveRemain <= 0) {
						// 这种情况几乎不会发生，纯粹为提高鲁棒性而写
						lines.push(lineDiv);
						lineDiv = document.createElement('div');
						lineDiv.className = 'line';
						lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
						remainW = this.maxWidth;
						items.unshift(item);
						continue;
					}
					const totalLen = fullText.length;
					const annoCharMap = this.buildCharIndexMap(annoElem);
					const {
						width: wholeWidth,
						split: wholeSplit
					} = this.getDualWidthAndSplit(annoElem, totalLen, this.noHeading, remainW);
					if (effectiveRemain >= wholeWidth) {
						const clonedAnno = annoElem.cloneNode(true);
						const annoSpan = this.insertBrAtGlobalIndex(clonedAnno, wholeSplit, this.buildCharIndexMap(clonedAnno));
						if (annoSpan) lineDiv.appendChild(annoSpan);
						remainW -= wholeWidth;
					} else {
						let bestN = 0;
						for (let n = 1; n < totalLen; n++) {
							const { width } = this.getDualWidthAndSplit(annoElem, n, this.noHeading, remainW);
							if (width <= remainW) bestN = n;
							else break;
						}
						if (bestN === 0) bestN = 1;
						const { split: innerSplit } = this.getDualWidthAndSplit(annoElem, bestN, this.noHeading, remainW);
						// 提取前半部分和后半部分（基于 annoElem 和它的字符映射）
						let frontFrag = this.extractFragment(annoElem, 0, bestN, annoCharMap);
						let backFrag = this.extractFragment(annoElem, bestN, totalLen, annoCharMap);
						// 拆分夾批后如果后半部分过短，则将后半部分并入前半部分，避免出现内容极短的单独注释
						if (backFrag && backFrag.textContent.trim().length <= this.minAnnoChars) {
							backFrag = null;
							frontFrag = this.extractFragment(annoElem, 0, totalLen, annoCharMap);
						}
						if (frontFrag) {
							// 拆分夾批后如果前半部分过短，则结束当前行，将前半部分并入后半部分等待处理，避免出现内容极短的单独注释
							if (frontFrag.textContent.trim().length <= this.minAnnoChars) {
								lines.push(lineDiv);
								lineDiv = document.createElement('div');
								lineDiv.className = 'line';
								lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
								remainW = this.maxWidth; // 当前行已满，下一行重置
								backFrag = this.extractFragment(annoElem, 0, totalLen, annoCharMap);
								const backSpan = document.createElement('span');
								backSpan.className = this.annoClass;
								backSpan.appendChild(backFrag);
								items.unshift({ type: 'anno', node: backSpan });
							} else {
								const frontSpan = document.createElement('span');
								frontSpan.className = this.annoClass;
								frontSpan.appendChild(frontFrag);
								// 将innerSplit的范围调整到frontSpan的索引范围以内，防止有内容的frontSpan返回null的annoSpan
								let insertPos = innerSplit;
								if (insertPos <= 0) insertPos = 1;
								if (insertPos >= frontSpan.textContent.length) insertPos = frontSpan.textContent.length - 1;
								const annoSpan = this.insertBrAtGlobalIndex(frontSpan, insertPos, this.buildCharIndexMap(frontSpan));
								//  或者简单在文本内容长度1/2处插入br，保护夹注内部DOM结构
								//  const annoSpan = this.insertBrAtGlobalIndex(frontSpan, frontSpan.textContent.length / 2, this.buildCharIndexMap(frontSpan));
								if (annoSpan) lineDiv.appendChild(annoSpan)
								lines.push(lineDiv);
								lineDiv = document.createElement('div');
								lineDiv.className = 'line';
								lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
								remainW = this.maxWidth; // 当前行已满，下一行重置
								if (backFrag) {
									const backSpan = document.createElement('span');
									backSpan.className = this.annoClass;
									backSpan.appendChild(backFrag);
									items.unshift({ type: 'anno', node: backSpan });
								}
							}
						}
					}
				}
			}
			if (lineDiv.childNodes.length > 0) {
				lines.push(lineDiv);
			}
			const paraFrag = document.createDocumentFragment();
			for(let i=0;i<lines.length;i++){
				if(i===0) // 第一行增加CSS类名，方便调整首行缩进
					lines[i].classList.add('first-line');
				paraFrag.appendChild(lines[i]);
			}
			para.replaceChildren(paraFrag);
		}

		// 静态批量初始化工具
		static activate(selector, option = {}) {
			const elements = document.querySelectorAll(selector);
			return Array.from(elements).map(el => new DualAnnoLayout(el, option));
		}
	}

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

	/**************创建拼音数据**************/

	// 加载单个json文件，blob方案，避免发生键值文本不规范引起的查找失败
	async function loadJsonFile(jsonPath) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('GET', jsonPath, true);
			xhr.responseType = 'blob';
			xhr.onload = async () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					const blob = xhr.response;
					const text = await blob.text();
					try {
						const rawObj = JSON.parse(text);
						resolve(rawObj);
					} catch (err) {
						reject(err);
					}
				} else {
					reject(new Error('Load failed, status:' + xhr.status));
				}
			};
			xhr.onerror = () => reject(new Error('Network error'));
			xhr.send(null);
		});
	}

	// 构造拼音数据字典
	async function buildPinyinCodeMap() {
		// 已挂载拼音数据，直接返回
		if (window.PINYIN_CODE_MAP && window.PHRASES_CODE_MAP) return true;
		if (dictLoading) return false; // 正在加载中，直接返回，防止并发请求
		dictLoading = true;
		try {
			// 相对路径，xhtml在OEBPS/Text，json放在OEBPS/scripts，按需修改路径
			const rawSingle = await loadJsonFile('../scripts/pinyin_dict.json');
			const rawPhrase = await loadJsonFile('../scripts/phrases_dict.json');

			// ========== 单字字典 PINYIN_CODE_MAP：key=字符码点16进制 ==========
			const PINYIN_CODE_MAP = {};
			for (const [hanzi, pinyinStr] of Object.entries(rawSingle)) {
				const ch = hanzi.normalize('NFC');
				const cpHex = ch.codePointAt(0).toString(16);
				PINYIN_CODE_MAP[cpHex] = pinyinStr;
			}

			// ========== 词语字典 PHRASES_CODE_MAP：key=词语原文（NFC归一），value拼音数组 ==========
			const PHRASES_CODE_MAP = {};
			for (const [phrase, pinyinArr] of Object.entries(rawPhrase)) {
				const phraseNorm = phrase.normalize('NFC');
				PHRASES_CODE_MAP[phraseNorm] = pinyinArr;
			}

			// 挂载全局，供查询逻辑使用
			window.PINYIN_CODE_MAP = PINYIN_CODE_MAP;
			window.PHRASES_CODE_MAP = PHRASES_CODE_MAP;

			//console.log(`Dict loaded: single=${Object.keys(PINYIN_CODE_MAP).length}, phrase=${Object.keys(PHRASES_CODE_MAP).length}`);
			return true;
		} catch (e) {
			console.error('Build pinyin map error:', e);
			return false;
		} finally {
			dictLoading = false; // 无论拼音数据加载成功失败，释放锁
		}
	}

	/**
	 * @param {string} selectedText 用户选中的文本
	 * @returns {string} 拼装好的带ruby的HTML
	 */
	function renderPinyinHtml(selectedText) {
		const txt = selectedText.normalize('NFC');
		const phraseMap = window.PHRASES_CODE_MAP;
		const charMap = window.PINYIN_CODE_MAP;
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
				// 过滤零宽字符
				if ([0x200B, 0x200C, 0x200D].includes(cp)) continue;
				const cpHex = cp.toString(16);
				const pyStr = charMap[cpHex];
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
		const cp = txt.codePointAt(0);
		const cpHex = cp.toString(16);
		const pyStr = charMap[cpHex].replace(',', ' / ');
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
		DualAnnoLayout.activate('.dual-layout', { annoClass: "anno" });
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

	whenDOMReady(async function() {
		const ok = await buildPinyinCodeMap();  // 确保拼音数据库创建成功
		if (ok) {
			init();
		}
	});

})();

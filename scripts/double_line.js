class DualAnnoLayout {
	constructor(element, option = {}) {
		this.element = element;
		this.container = document.querySelector('.story') || element.parentElement;
		this.originalHTML = element.innerHTML;

		this.noHeading = option.noHeading || '!%),.:;>?]}¢¨°·ˇˉ―‖’”…‰′″›℃∶、。〃〉》」』】〕〗〞︶︺︾﹀﹄﹚﹜﹞！＂％＇），．：；？］｀｜｝～￠，？’';
		this.noTailing = option.noTailing || '$([{£¥·‘“〈《「『【〔〖〝﹙﹛﹝＄（．［｛￡￥';
		this.minAnnoChars = option.minAnnoChars ?? 2;
		this.rightAdjust = option.rightAdjust ?? 4;          // 安全余量（px）
		this.annoClass = option.annoClass || 'annotation';
		this.annoRatio = option.annoRatio ?? 0.8;            // 与 CSS 夹批 font-size 保持一致
		this.moveForIlleChar = option.moveForIlleChar ?? 3;

		this.measureEl = null;          // 复用测量元素
		this.widthCache = new Map();    // text + styleKey → width
		this.charIndexCache = new WeakMap();
		this.ticking = false;

		if (!this.hasAnnotation()) return;
		this.init();
	}

	hasAnnotation() {
		const temp = document.createElement('div');
		temp.innerHTML = this.originalHTML;
		return !!temp.querySelector(`.${this.annoClass}`);
	}

	init() {
		window.addEventListener('resize', () => {
			if (this.ticking) return;
			this.ticking = true;
			requestAnimationFrame(() => {
				this.widthCache.clear();
				this.render();
				this.ticking = false;
			});
		});
		this.render();
	}

	/* -------------------- 测量相关 -------------------- */

	ensureMeasureEl() {
		if (this.measureEl) return this.measureEl;
		const el = document.createElement('span');
		el.style.cssText = `
			position: absolute;
			visibility: hidden;
			white-space: pre;
			left: -9999px;
			top: 0;
			pointer-events: none;
		`;
		document.body.appendChild(el);
		this.measureEl = el;
		return el;
	}

	getStyleKey(element, isAnno) {
		const s = window.getComputedStyle(element);
		return [
			s.fontStyle, s.fontWeight, s.fontSize, s.fontFamily,
			s.letterSpacing, isAnno ? this.annoRatio : 1
		].join('|');
	}

	/**
	 * 更精确的宽度测量：用真实 DOM 渲染结果，而不是 canvas + 魔法补偿
	 */
	measureTextWidth(text, element, isAnno = false) {
		if (!text) return 0;

		const styleKey = this.getStyleKey(element, isAnno);
		const cacheKey = styleKey + '::' + text;
		if (this.widthCache.has(cacheKey)) {
			return this.widthCache.get(cacheKey);
		}

		const meas = this.ensureMeasureEl();
		const s = window.getComputedStyle(element);

		meas.style.fontStyle = s.fontStyle;
		meas.style.fontWeight = s.fontWeight;
		meas.style.fontFamily = s.fontFamily;
		meas.style.letterSpacing = s.letterSpacing;

		const baseSize = parseFloat(s.fontSize) || 16;
		meas.style.fontSize = isAnno
			? (baseSize * this.annoRatio) + 'px'
			: s.fontSize;

		meas.textContent = text;
		let width = meas.getBoundingClientRect().width;

		// 系统性偏小补偿：正文约 1%，夹注约 5%
		const safety = isAnno ? 1.05 : 1.01;
		width *= safety;
		if (isAnno && text.length > 0) {
			width += 2; // 对应 margin/padding
		}

		this.widthCache.set(cacheKey, width);
		return width;
	}

	getHorizontalExtraWidth(element) {
		const s = window.getComputedStyle(element);
		return (
			(parseFloat(s.paddingLeft) || 0) +
			(parseFloat(s.paddingRight) || 0) +
			(parseFloat(s.borderLeftWidth) || 0) +
			(parseFloat(s.borderRightWidth) || 0) +
			(parseFloat(s.marginLeft) || 0) +
			(parseFloat(s.marginRight) || 0)
		);
	}

	updateMaxWidth() {
		const rect = this.container.getBoundingClientRect();
		const extra = this.getHorizontalExtraWidth(this.container);
		this.maxWidth = Math.max(0, rect.width - extra - this.rightAdjust);
	}

	/** 计算首行缩进实际占用宽度（比硬编码 38 可靠） */
	getFirstLineIndentWidth() {
		const s = window.getComputedStyle(this.element);
		const textIndent = parseFloat(s.textIndent) || 0;
		if (textIndent > 0) return textIndent;

		// 常见中文排版：首行缩进 2 个汉字
		const base = this.measureTextWidth('中', this.element, false);
		return base * 2;
	}

	/* -------------------- 字符索引工具 -------------------- */

	buildCharIndexMap(element) {
		if (this.charIndexCache.has(element)) {
			return this.charIndexCache.get(element);
		}
		const map = new Map();
		let acc = 0;
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) {
			if (node.textContent.length > 0) {
				map.set(node, acc);
				acc += node.textContent.length;
			}
		}
		this.charIndexCache.set(element, map);
		return map;
	}

	getNodeAndOffset(charIndex, charIndexMap) {
		for (const [node, start] of charIndexMap) {
			const end = start + node.textContent.length;
			if (charIndex >= start && charIndex <= end) {
				return { node, offset: charIndex - start };
			}
		}
		return null;
	}

	getSubWidth(element, startIdx, endIdx, charIndexMap, isAnno = false) {
		if (startIdx >= endIdx) return 0;
		let total = 0;
		for (const [node, nodeStart] of charIndexMap) {
			const nodeEnd = nodeStart + node.textContent.length;
			if (nodeEnd <= startIdx) continue;
			if (nodeStart >= endIdx) break;

			const sliceStart = Math.max(0, startIdx - nodeStart);
			const sliceEnd = Math.min(node.textContent.length, endIdx - nodeStart);
			if (sliceEnd > sliceStart) {
				const textSlice = node.textContent.slice(sliceStart, sliceEnd);
				const parent = node.parentElement || element;
				const anno = isAnno || parent.classList.contains(this.annoClass);
				total += this.measureTextWidth(textSlice, parent, anno);
			}
		}
		return total;
	}

	getWidthUpTo(n, elem, charMap = null, isAnno = false) {
		const map = charMap || this.buildCharIndexMap(elem);
		return this.getSubWidth(elem, 0, n, map, isAnno);
	}

	/* -------------------- 分割与避让 -------------------- */

	/**
	 * 在给定最大宽度下，找到能放下的最大字符数，并做标点避让
	 */
	measureTextFit(text, element, maxWidth, isAnno = false) {
		if (!text) return 0;
		let left = 0, right = text.length, fit = 0;
		while (left <= right) {
			const mid = (left + right) >> 1;
			const w = this.measureTextWidth(text.slice(0, mid), element, isAnno);
			if (w <= maxWidth) {
				fit = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		// 标点避让：优先不把禁止行尾的字符留在行尾
		while (fit > 0 && this.noTailing.includes(text[fit - 1])) fit--;
		// 也不要把禁止行首的字符放到下一行开头
		while (fit < text.length && this.noHeading.includes(text[fit])) fit++;

		if (fit === 0 && text.length > 0) fit = 1; // 至少放一个字，防止死循环
		return fit;
	}

	/**
	 * 计算双行合一宽度，并给出较平衡的分割点
	 * 返回 { width: max(上行, 下行), split }
	 */
	getDualWidthAndSplit(annoElem, n, remainW) {
		const fullText = annoElem.textContent;
		if (n <= 0) return { width: 0, split: 0 };

		// 避免分割点落在非法行首字符上
		let splitCand = n;
		let moved = 0;
		while (
			moved < this.moveForIlleChar &&
			splitCand < fullText.length &&
			this.noHeading.includes(fullText[splitCand])
		) {
			splitCand++;
			moved++;
		}
		n = Math.min(splitCand, fullText.length);
		if (n < 2) {
			const w = this.getWidthUpTo(n, annoElem, null, true);
			return { width: w, split: n };
		}

		const totalW = this.getWidthUpTo(n, annoElem, null, true);
		let bestSplit = Math.floor(n / 2);
		let bestMax = Infinity;

		// 在合理范围内找使上下行宽度差最小的分割点
		const lo = Math.max(1, Math.floor(n * 0.3));
		const hi = Math.min(n - 1, Math.ceil(n * 0.7));

		for (let s = lo; s <= hi; s++) {
			// 简单避让
			if (this.noTailing.includes(fullText[s - 1])) continue;
			if (s < n && this.noHeading.includes(fullText[s])) continue;

			const w1 = this.getWidthUpTo(s, annoElem, null, true);
			const w2 = totalW - w1;
			const mx = Math.max(w1, w2);
			if (mx < bestMax && mx <= remainW + 0.5) { // 允许极小浮点误差
				bestMax = mx;
				bestSplit = s;
			}
		}

		// 如果上面没找到合适的，退回中点
		if (bestMax === Infinity) {
			bestSplit = Math.floor(n / 2);
			const w1 = this.getWidthUpTo(bestSplit, annoElem, null, true);
			bestMax = Math.max(w1, totalW - w1);
		}

		return { width: bestMax, split: bestSplit };
	}

	insertBrAtGlobalIndex(element, globalIndex, charIndexMap) {
		for (const [node, start] of charIndexMap) {
			const end = start + node.textContent.length;
			if (globalIndex < start || globalIndex > end) continue;

			const parent = node.parentNode;
			if (!parent) return null;

			let br;
			if (globalIndex === start) {
				br = document.createElement('br');
				parent.insertBefore(br, node);
			} else if (globalIndex === end) {
				br = document.createElement('br');
				parent.insertBefore(br, node.nextSibling);
			} else {
				let offset = globalIndex - start;
				const text = node.textContent;
				// 再做一次行首避让
				let moved = 0;
				while (
					moved < this.moveForIlleChar &&
					offset < text.length &&
					this.noHeading.includes(text[offset])
				) {
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

			// 防止 br 前后完全空导致塌陷
			const ensureNbsp = (side) => {
				const sibling = side === 'before' ? br.previousSibling : br.nextSibling;
				let hasText = false;
				let cur = sibling;
				while (cur) {
					if (cur.nodeType === Node.TEXT_NODE && cur.textContent.trim()) {
						hasText = true;
						break;
					}
					cur = side === 'before' ? cur.previousSibling : cur.nextSibling;
				}
				if (!hasText) {
					const nbsp = document.createTextNode('\u00A0');
					if (side === 'before') parent.insertBefore(nbsp, br);
					else parent.insertBefore(nbsp, br.nextSibling);
				}
			};
			ensureNbsp('before');
			ensureNbsp('after');

			return element;
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
		return range.cloneContents();
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

		// 下行行首避让
		const text = rangeBack.toString();
		let moved = 0;
		while (
			moved < this.moveForIlleChar &&
			moved < text.length &&
			this.noHeading.includes(text[moved])
		) {
			moved++;
			endPosFront.offset++;
		}
		rangeFront.setEnd(endPosFront.node, endPosFront.offset);
		rangeBack.setStart(endPosFront.node, endPosFront.offset);

		const frontFrag = rangeFront.cloneContents();
		const backFrag = rangeBack.cloneContents();

		const cloneWithAttrs = (elem) => {
			const clone = document.createElement(elem.tagName);
			for (const attr of elem.attributes) {
				clone.setAttribute(attr.name, attr.value);
			}
			if (elem.style?.cssText) clone.style.cssText = elem.style.cssText;
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

		const isAnno = elem.classList.contains(this.annoClass);
		const fullWidth = this.getWidthUpTo(totalLen, elem, null, isAnno) + extraWidth;
		if (fullWidth <= remainWidth) {
			return { fitted: elem.cloneNode(true), rest: null, usedWidth: fullWidth };
		}

		let low = 0, high = totalLen, bestLen = 0;
		const charMap = this.buildCharIndexMap(elem);
		while (low <= high) {
			const mid = (low + high) >> 1;
			const width = this.getSubWidth(elem, 0, mid, charMap, isAnno) + extraWidth;
			if (width <= remainWidth) {
				bestLen = mid;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}
		if (bestLen === 0) bestLen = 1;

		// 标点避让
		const text = elem.textContent;
		while (bestLen > 0 && this.noTailing.includes(text[bestLen - 1])) bestLen--;
		while (bestLen < totalLen && this.noHeading.includes(text[bestLen])) bestLen++;
		if (bestLen === 0) bestLen = 1;

		const { front, back } = this.splitElementByCharIndex(elem, bestLen);
		const usedWidth = front
			? this.getWidthUpTo(front.textContent.length, front, null, isAnno) + extraWidth
			: 0;
		return { fitted: front, rest: back, usedWidth };
	}

	/* -------------------- 渲染主逻辑 -------------------- */

	render() {
		this.updateMaxWidth();
		if (this.maxWidth <= 0) return;

		if (!document.querySelector('#anno-style')) {
			const style = document.createElement('style');
			style.id = 'anno-style';
			style.textContent = `
				.${this.annoClass} {
					display: inline-block !important;
					vertical-align: middle;
					margin: 0 1px;
					padding: 0 1px;
					line-height: 1.35;
					font-size: ${this.annoRatio}em;
				}
				.line {
					white-space: nowrap !important;
					overflow: visible !important;
					box-sizing: border-box;
				}
				.line.first-line {
					/* 如需额外首行样式可在此添加 */
				}
			`;
			document.head.appendChild(style);
		}

		this.element.innerHTML = this.originalHTML;
		this.charIndexCache = new WeakMap(); // 原 DOM 已变，清空缓存
		this.renderPara(this.element);
	}

	renderPara(para) {
		const items = [];
		for (const child of para.childNodes) {
			if (child.nodeType === Node.TEXT_NODE && child.textContent.length) {
				items.push({ type: 'text', node: child, parent: child.parentElement || para });
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				if (child.classList.contains(this.annoClass)) {
					items.push({ type: 'anno', node: child });
				} else {
					items.push({ type: 'element', node: child });
				}
			}
		}

		const lines = [];
		let lineDiv = this.createLineDiv();
		let remainW = this.maxWidth;
		let isFirstLine = true;

		if (isFirstLine) {
			remainW -= this.getFirstLineIndentWidth();
		}

		const pushLine = () => {
			lines.push(lineDiv);
			lineDiv = this.createLineDiv();
			remainW = this.maxWidth;
			isFirstLine = false;
		};

		while (items.length > 0) {
			const item = items.shift();

			if (item.type === 'text') {
				let text = item.node.textContent;

				// 行首非法字符尽量推到上一行（如果上一行还有空间则更好，这里简化处理）
				if (lineDiv.textContent.length === 0) {
					let i = 0;
					while (i < text.length && this.noHeading.includes(text[i])) i++;
					if (i > 0) {
						// 仍然放到当前行开头（用 nbsp 或直接放），避免丢字符
						lineDiv.appendChild(document.createTextNode(text.slice(0, i)));
						text = text.slice(i);
					}
				}

				if (!text) continue;

				const fullWidth = this.measureTextWidth(text, item.parent, false);
				if (fullWidth <= remainW) {
					lineDiv.appendChild(document.createTextNode(text));
					remainW -= fullWidth;
				} else {
					const fitChars = this.measureTextFit(text, item.parent, remainW, false);
					if (fitChars <= 0) {
						pushLine();
						items.unshift(item);
						continue;
					}
					const fitText = text.slice(0, fitChars);
					const restText = text.slice(fitChars);
					lineDiv.appendChild(document.createTextNode(fitText));
					remainW -= this.measureTextWidth(fitText, item.parent, false);

					if (restText) {
						items.unshift({
							type: 'text',
							node: document.createTextNode(restText),
							parent: item.parent
						});
					}
					pushLine();
				}
			} else if (item.type === 'element') {
				const elem = item.node;
				const extra = this.getHorizontalExtraWidth(elem);
				if (remainW - extra <= 0) {
					pushLine();
					items.unshift(item);
					continue;
				}
				const { fitted, rest, usedWidth } = this.splitElementByWidth(elem, remainW, extra);
				if (fitted) {
					lineDiv.appendChild(fitted);
					remainW -= usedWidth;
				}
				if (rest) {
					items.unshift({ type: 'element', node: rest });
					pushLine();
				}
			} else if (item.type === 'anno') {
				const annoElem = item.node;
				const fullText = annoElem.textContent;
				if (!fullText.trim()) continue;

				const extra = this.getHorizontalExtraWidth(annoElem);
				const effectiveRemain = remainW - extra;
				if (effectiveRemain <= 0) {
					pushLine();
					items.unshift(item);
					continue;
				}

				const totalLen = fullText.length;
				const { width: wholeWidth, split: wholeSplit } =
					this.getDualWidthAndSplit(annoElem, totalLen, effectiveRemain);

				if (effectiveRemain >= wholeWidth - 0.5) {
					// 整段夹注能放下
					const cloned = annoElem.cloneNode(true);
					const map = this.buildCharIndexMap(cloned);
					const withBr = this.insertBrAtGlobalIndex(cloned, wholeSplit, map);
					if (withBr) {
						lineDiv.appendChild(withBr);
						remainW -= wholeWidth;
					}
				} else {
					// 需要拆分夹注
					let bestN = 0;
					for (let n = 1; n <= totalLen; n++) {
						const { width } = this.getDualWidthAndSplit(annoElem, n, effectiveRemain);
						if (width <= effectiveRemain + 0.5) bestN = n;
						else break;
					}
					if (bestN === 0) bestN = Math.min(2, totalLen);

					const { split: innerSplit } =
						this.getDualWidthAndSplit(annoElem, bestN, effectiveRemain);

					const annoCharMap = this.buildCharIndexMap(annoElem);
					let frontFrag = this.extractFragment(annoElem, 0, bestN, annoCharMap);
					let backFrag = this.extractFragment(annoElem, bestN, totalLen, annoCharMap);

					// 后半过短 → 合并
					if (backFrag && backFrag.textContent.trim().length <= this.minAnnoChars) {
						backFrag = null;
						frontFrag = this.extractFragment(annoElem, 0, totalLen, annoCharMap);
					}

					if (frontFrag) {
						const frontLen = frontFrag.textContent.trim().length;
						if (frontLen <= this.minAnnoChars) {
							// 前半过短，整段挪到下一行
							pushLine();
							const backSpan = document.createElement('span');
							backSpan.className = this.annoClass;
							backSpan.appendChild(
								this.extractFragment(annoElem, 0, totalLen, annoCharMap)
							);
							items.unshift({ type: 'anno', node: backSpan });
						} else {
							const frontSpan = document.createElement('span');
							frontSpan.className = this.annoClass;
							frontSpan.appendChild(frontFrag);

							let insertPos = Math.min(
								Math.max(1, innerSplit),
								frontSpan.textContent.length - 1
							);
							const map = this.buildCharIndexMap(frontSpan);
							const withBr = this.insertBrAtGlobalIndex(frontSpan, insertPos, map);
							if (withBr) lineDiv.appendChild(withBr);

							pushLine();

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

		const frag = document.createDocumentFragment();
		lines.forEach((line, i) => {
			if (i === 0) line.classList.add('first-line');
			frag.appendChild(line);
		});
		para.replaceChildren(frag);
	}

	createLineDiv() {
		const div = document.createElement('div');
		div.className = 'line';
		// 统一使用 maxWidth，不再加减 rightAdjust
		div.style.width = this.maxWidth + 'px';
		return div;
	}

	static activate(selector, option = {}) {
		return Array.from(document.querySelectorAll(selector))
			.map(el => new DualAnnoLayout(el, option));
	}
}

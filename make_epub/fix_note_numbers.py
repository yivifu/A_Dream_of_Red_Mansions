# 在Calibre编辑器中搜索(?s)^.+$，全部替换，可以避免HTML文件中的&#\d+;形式的实体被BeautifulSoup修改
import re
from bs4 import BeautifulSoup
from pathlib import Path

def replace(match, number, file_name, metadata, dictionaries, data, functions, *args, **kwargs):
	if match is None:
		if data['errs']:
			print('\n'.join(data['errs']))
		return
	else:
		if 'errs' not in data:
			data['errs'] = []
		full_html = match.group()
		file_stem = Path(file_name).stem

		if not file_stem.startswith('ch'):
			return full_html
		# 文件名不规范时也可以用下行作a标签的id及href属性的章节前缀
		#chapter = f'ch{number:03d}'  
		chapter = file_stem[:5]

		# 1. 捕获所有数字实体，存映射表
		entity_map = {}
		counter = 0
		def repl_save(m):
			nonlocal counter
			key = f"__ENTITY_PLACEHOLDER_{counter}__"
			entity_map[key] = m.group(0)
			counter +=1
			return key
		# 匹配 &#数字;
		raw = re.sub(r'&#\d+;', repl_save, full_html)

		# 2. bs4解析（此时没有实体，不会被解码）
		soup = BeautifulSoup(raw, "html.parser")
		note_refs = soup.find_all('a', {'class': 'noteref'})
		note_contents = soup.find_all('aside', {'class': 'comment'})
		
		if len(note_refs) != len(note_contents):
				data['errs'].append(f'文件“{file_name.split("/")[-1]}”中注释引用与注释内容数量不一致，请先检查。')
				return full_html

		for i, (note_ref, note_content) in enumerate(zip(note_refs, note_contents), start=1):
			num_str = f"{i:02d}"
			note_ref['href'] = f'#{chapter}note{num_str}'
			note_ref['data-href'] = f'{chapter}note{num_str}'
			note_ref['id'] = f'ref_{chapter}note{num_str}'
			sup_tag = note_ref.find('sup')
			if sup_tag:
				sup_tag.string = f'[{i}]'
			else:
				note_ref.string = f'[{i}]'
			note_content['id'] = f'{chapter}note{num_str}'
			a_tag = note_content.find('a')
			if a_tag:
				a_tag['href'] = f'#ref_{chapter}note{num_str}'
				a_tag.string = f'[{i}]'

		# 3. 输出，再把占位符还原回实体
		out = soup.encode(formatter="minimal").decode("utf-8")
		for k,v in entity_map.items():
			out = out.replace(k, v)
		return out

replace.file_order = 'spine'
replace.call_after_last_match = True
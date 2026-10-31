# 在Calibre编辑器中搜索(?s)^.+$，全部替换，可以避免HTML文件中的&#\d+;形式的实体被BeautifulSoup修改
import re
from bs4 import BeautifulSoup
from pathlib import Path


def replace(match, number, file_name, metadata, dictionaries, data, functions, *args, **kwargs):
    # 设置replace.call_after_last_match = True，所有匹配完成处理后会执行if match is None分支
    if match is None:
        if data['errs']:
            print('\n'.join(data['errs']))  # 如果有错误输出错误信息
        return
    else:
        if 'errs' not in data:  # 初始化跨文件持久化变量
            data['errs'] = []
        # 搜索(?s)^.+$，匹配的将是文档全部内容
        full_html = match.group()
        # 利用文件名前几个字符作为a.id和a.href中的命名前缀
        file_stem = Path(file_name).stem
        chapter = file_stem[:5]

        # 文件名不规范时也可以用如下方式创建a标签的id及href属性的命名前缀
        # 这样可以确保不同文件中的a标签的id和href互不冲突。
        # chapter = f'ch{number:03d}'

        # 1. 捕获所有数字实体，存映射表
        entity_map = {}
        counter = 0

        def repl_save(m):
            nonlocal counter
            key = f"__ENTITY_PLACEHOLDER_{counter}__"
            entity_map[key] = m.group(0)
            counter += 1
            return key

        # 匹配 &#数字;
        raw = re.sub(r'&#\d+;', repl_save, full_html)

        # 2. bs4解析（此时没有实体，不会被解码）
        soup = BeautifulSoup(raw, "html.parser")
        note_refs = soup.find_all('a', {'class': 'noteref'})
        note_contents = soup.find_all('aside', {'class': 'comment'})
        # 注释引用与注释内容数量不一致不处理且添加错误信息
        if len(note_refs) != len(note_contents):
            data['errs'].append(f'文件“{file_name.split("/")[-1]}”中注释引用与注释内容数量不一致，请先检查。')
            return full_html

        for i, (note_ref, note_content) in enumerate(zip(note_refs, note_contents), start=1):
            num_str = f"{i:02d}"
            note_ref['href'] = f'#{chapter}note{num_str}'
            # 改写时忘了写data-href属性会添加此属性
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
        for k, v in entity_map.items():
            out = out.replace(k, v)
        return out


replace.file_order = 'spine'  # 设置文件处理顺序，按目录顺序来
replace.call_after_last_match = True
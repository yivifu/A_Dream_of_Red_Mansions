##########################################################################
# 在html文件中插入或者删除新的注释后，将注释顺序重新修改正确。使用时注意修改
# 93~95行d的变量 input_file、chapter、output_file 的值。
##########################################################################
import re
from bs4 import BeautifulSoup

def fix_note_numbers_by_bs4(input_file, chapter, output_file):
    """
    使用BeautifulSoup检查文中的所有注释引用和注释内容，更正编号顺序错误或者重复的编号，
    不受HTML格式（换行、空格）影响
    """
    with open(input_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    # 查找全部注释引用
    note_refs = soup.find_all('a', {'epub:type': 'noteref'})
    # 查找全部注释内容
    note_contents = soup.find_all('aside', {'class': 'comment', 'epub:type': 'footnote'})
    
    print(f"找到 {len(note_refs)} 个注释引用和 {len(note_contents)} 个注释内容")
    
    for i, (note_ref, note_content) in enumerate(zip(note_refs, note_contents)):
        new_num = i + 1  # 注释编号
        num_str = f"{new_num:02d}"  # 注释编号不足两位时前面补0
        
        note_ref['href'] = f'#{chapter}note{num_str}'  # 修改注释引用href属性值
        note_ref['id'] = f'ref_{chapter}note{num_str}'  # 修改注释引用id属性值
        
        sup_tag = note_ref.find('sup')  # 注释引用中的sup标签
        if sup_tag:
            sup_tag.string = f'[{new_num}]'  # sup标签文本直接使用注释编号值
        
        note_content['id'] = f'{chapter}note{num_str}'  # 修改注释内容id属性值
        
        a_tag = note_content.find('a')  # 注释内容中指向注释引用的链接
          # 修改链接的href值与文本
        if a_tag:
            a_tag['href'] = f'#ref_{chapter}note{num_str}'
            a_tag.string = f'[{new_num}]'
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(str(soup))
    
    print(f"处理完成！共修复了 {len(note_refs)} 个注释引用和 {len(note_contents)} 个注释内容。")

def fix_note_numbers(input_file, chapter, output_file):
    """
    使用正则表达式检查文中的所有注释引用和注释内容，更正编号顺序错误或者重复的编号，
    适用于HTML文档没有多余的空格或换行的情形
    """
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    # 注释引用模式
    note_ref_pattern = re.compile(r'<a epub:type="noteref" href="#{chapter}note(\d+)" id="ref_{chapter}note(\d+)"><sup>\[(\d+)\]</sup></a>')
    # 注释内容模式
    note_content_pattern = re.compile(r'<aside class="comment" epub:type="footnote" id="{chapter}note(\d+)"><a href="#ref_{chapter}note(\d+)">\[\d+\]</a>')
    # 注释引用列表
    ref_matches = list(note_ref_pattern.finditer(content))
    # 注释内容列表
    content_matches = list(note_content_pattern.finditer(content))
    
    new_content = content
    
    for i, (ref_match, content_match) in enumerate(zip(ref_matches, content_matches)):
        new_num = i + 1  # 注释编号
        num_str = f"{new_num:02d}"  # 注释编号不足两位时前面补0
        
        ref_start = ref_match.start()  # 注释引用开始位置
        ref_end = ref_match.end() # 注释引用结束位置
        # old_ref_text = ref_match.group(0)  # 原始注释引用整个标签字符串，如果用re.sub完成替换的话需要保存
        # 用于替换原始注释引用标签的的新注释引用标签字符串
        new_ref_text = f'<a epub:type="noteref" href="#{chapter}note{num_str}" id="ref_{chapter}note{num_str}"><sup>[{new_num}]</sup></a>'
        # 修改HTML内容，使用字符串切片和拼接完成
        new_content = new_content[:ref_start] + new_ref_text + new_content[ref_end:]
        
        content_start = content_match.start()  # 注释内容开始位置
        content_end = content_match.end() # 注释内容结束位置
        # old_content_text = content_match.group(0)  # 原始注释内容整个标签字符串，如果用re.sub完成替换的话需要保存
        # 用于替换原始注释内容标签的的新注释内容标签字符串        
        new_content_text = f'<aside class="comment" epub:type="footnote" id="{chapter}note{num_str}"><a href="#ref_{chapter}note{num_str}">[{new_num}]</a>'
        
        # 修改HTML内容，使用字符串切片和拼接完成
        new_content = new_content[:content_start] + new_content_text + new_content[content_end:]
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"处理完成！共修复了 {len(ref_matches)} 个注释引用和 {len(content_matches)} 个注释内容。")

if __name__ == '__main__':
    input_file = r'..\text\ch008第八回薛宝钗小恙梨香院贾宝玉大醉绛芸轩.htm'
    output_file = 'ch008第八回薛宝钗小恙梨香院贾宝玉大醉绛芸轩.htm'
    chapter = 'ch008'
    fix_note_numbers_by_bs4(input_file, chapter, output_file)
"""Extract this edition's OX book from its two parallel HWPX text streams."""
import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'book'
NUMBER_STYLES = {'15': (1, 9), '16': (10, 99), '8': (100, 999), '7': (1000, 3129)}
MARKERS = {'[○]': 'O', '[×]': 'X', '[X]': 'X'}
STAGES = ((1, 504), (505, 1859), (1860, 3129))
FORMAT = {'fwSpace': '\u3000', 'nbSpace': '\u00a0', 'lineBreak': '\n', 'tab': '\t'}


def tag(node):
    return node.tag.rsplit('}', 1)[-1]


def nested(node, name):
    return (child for child in node.iter() if tag(child) == name)


def text(node):
    return ''.join((part.text or '') + ''.join(
        FORMAT.get(tag(child), '') + (child.tail or '') for child in part
    ) for part in nested(node, 't'))


def topic_number(label, unit):
    match = re.match(rf'\s*제(\d+){unit}', label)
    if not match:
        raise ValueError(f'Missing {unit} number: {label}')
    return int(match[1])


def read_toc(section):
    stages = []
    for paragraph in section:
        style = paragraph.get('styleIDRef')
        if style == '36':
            stages.append({'stage': len(stages) + 1, 'parts': []})
        if style not in ('37', '38', '40') or not text(paragraph).strip():
            continue
        original, title, page = text(paragraph).split('\t')
        parts = stages[-1]['parts']
        unit = {'37': '편', '38': '장', '40': '절'}[style]
        number = topic_number(original, unit)
        entry = {'number': number, 'label': f'{original} {title}', 'page': int(page), 'count': 0}
        if style == '37':
            parts.append({**entry, 'chapters': []})
        elif style == '38':
            key = f"{stages[-1]['stage']}-{parts[-1]['number']}-{number}"
            parts[-1]['chapters'].append({**entry, 'key': key, 'sections': []})
        else:
            parts[-1]['chapters'][-1]['sections'].append(entry)
    return stages


def read_table(table):
    return {'kind': 'table', 'rows': [[{
        'text': '\n'.join(text(p) for p in nested(cell, 'p')),
        'rowSpan': int(next(nested(cell, 'cellSpan')).get('rowSpan')),
        'colSpan': int(next(nested(cell, 'cellSpan')).get('colSpan')),
    } for cell in row if tag(cell) == 'tc'] for row in table if tag(row) == 'tr']}


def read_blocks(paragraph):
    blocks = []
    words = ''
    for run in paragraph:
        if tag(run) != 'run':
            continue
        for element in run:
            match tag(element):
                case 't':
                    words += text(element)
                case 'tbl':
                    if words:
                        blocks.append({'kind': 'text', 'text': words})
                        words = ''
                    blocks.append(read_table(element))
    if words:
        blocks.append({'kind': 'text', 'text': words})
    return blocks


def read_answers(section):
    answers = []
    for index, paragraph in enumerate(section):
        if paragraph.get('styleIDRef') != '1':
            continue
        blocks = read_blocks(paragraph)
        if not blocks:
            continue
        initial = blocks[0].get('text', '').lstrip(' ')
        marker = initial[:3]
        if marker in MARKERS:
            remaining = initial[3:].removeprefix('\u00a0')
            blocks[0:1] = [{'kind': 'text', 'text': remaining}] if remaining else []
            answers.append({'marker': marker, 'answer': MARKERS[marker], 'explanation': blocks, 'answerIndex': index})
        elif answers and initial.strip():
            answers[-1]['explanation'].extend(blocks)
    return answers


def read_questions(section, stages):
    questions = []
    stage = 0
    part = chapter = current_section = None
    part_index = 0
    for index, paragraph in enumerate(section):
        label = text(paragraph)
        part_match = re.search(r'PART\s+([12])', label)
        if part_match and '제' + part_match[1] + '편' in label:
            part_index = int(part_match[1])
            if part_index == 1:
                stage += 1
            part = stages[stage - 1]['parts'][part_index - 1]
            chapter = current_section = None
        for heading in nested(paragraph, 'p'):
            if heading.get('styleIDRef') == '22':
                heading_text = text(heading)
                match = re.search(r'제(\d+)장', heading_text)
                if not match or part is None:
                    raise ValueError(f'Unrecognized chapter heading at paragraph {index}')
                chapter = part['chapters'][int(match[1]) - 1]
                if chapter['label'].split(' ', 1)[1] not in heading_text:
                    raise ValueError(f'Chapter heading mismatch at paragraph {index}')
                current_section = None
            if heading.get('styleIDRef') == '32':
                heading_text = text(heading)
                current_section = chapter['sections'][topic_number(heading_text, '절') - 1]
                if current_section['label'].split(' ', 1)[1] != re.sub(r'^제\d+절', '', heading_text).strip():
                    raise ValueError(f'Section heading mismatch at paragraph {index}')
        if paragraph.get('styleIDRef') != '12':
            continue
        no = len(questions) + 1
        low, high = NUMBER_STYLES[section[index - 1].get('styleIDRef')]
        if not low <= no <= high or not STAGES[stage - 1][0] <= no <= STAGES[stage - 1][1]:
            raise ValueError(f'Numbering mismatch at {no}, paragraph {index}')
        runs = [run for run in paragraph if tag(run) == 'run']
        source, = [text(run).strip('\t') for run in runs if run.get('charPrIDRef') == '69' and text(run).strip()]
        prompt = ''.join(text(run) for run in runs if run.get('charPrIDRef') != '69').removesuffix('\u3000')
        section_number = current_section['number'] if current_section else None
        questions.append({
            'id': f'pch-ox-{no}', 'no': no, 'stage': stage, 'part': part_index, 'chapter': chapter['number'],
            'section': section_number, 'prompt': prompt, 'source': source,
            'chapterKey': chapter['key'], 'questionIndex': index,
        })
        chapter['count'] += 1
        part['count'] += 1
        if current_section:
            current_section['count'] += 1
    return questions


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def extract(path, output):
    fingerprint = hashlib.sha256(path.read_bytes()).hexdigest()
    with ZipFile(path) as archive:
        toc = read_toc(ET.fromstring(archive.read('Contents/section0.xml')))
        body = ET.fromstring(archive.read('Contents/section1.xml'))
        questions = read_questions(body, toc)
        answers = read_answers(body)
    if len(questions) != 3129 or len(answers) != 3129:
        raise ValueError(f'Expected 3,129 questions and answers. Got {len(questions)} and {len(answers)}.')
    chapters = defaultdict(list)
    for question, answer in zip(questions, answers, strict=True):
        record = {**question, **answer}
        chapters[question['chapterKey']].append(record)
    manifest = {
        'edition': '박철한 경찰헌법 OX · 2026',
        'version': fingerprint[:16], 'sha256': fingerprint, 'count': len(questions), 'stages': toc,
    }
    for key, records in chapters.items():
        write_json(output / manifest['version'] / f'{key}.json', records)
    write_json(output / 'manifest.json', manifest)
    print(f"Imported {len(questions)} questions across {len(chapters)} chapters from {fingerprint[:16]}.")


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('source', type=Path)
    cli.add_argument('--output', type=Path, default=ROOT)
    args = cli.parse_args()
    extract(args.source, args.output)

"""Verify the shipped edition. Pass --source for a byte-for-byte re-extraction check."""
import argparse
import json
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

from import_book import ET, ZipFile, MARKERS, ROOT, STAGES, extract, tag


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def verify(root):
    manifest = read(root / 'manifest.json')
    assert manifest['count'] == 3129
    assert manifest['version'] == manifest['sha256'][:16]
    rows = []
    for stage, expected in zip(manifest['stages'], STAGES, strict=True):
        stage_rows = []
        for part in stage['parts']:
            part_count = 0
            for chapter in part['chapters']:
                questions = read(root / manifest['version'] / (chapter['key'] + '.json'))
                assert chapter['count'] == len(questions)
                part_count += len(questions)
                counts = Counter(question['section'] for question in questions)
                for section in chapter['sections']:
                    assert section['count'] == counts[section['number']] > 0
                for question in questions:
                    assert [question[key] for key in ('stage', 'part', 'chapter', 'chapterKey')] == [
                        stage['stage'], part['number'], chapter['number'], chapter['key']
                    ]
                    assert question['id'] == f"pch-ox-{question['no']}"
                    assert question['prompt'].strip() and question['source'].strip() and question['explanation']
                    assert question['answer'] == MARKERS[question['marker']]
                stage_rows.extend(questions)
            assert part['count'] == part_count
        assert [question['no'] for question in stage_rows] == list(range(expected[0], expected[1] + 1))
        rows.extend(stage_rows)
    assert len(rows) == manifest['count']
    assert len(list((root / manifest['version']).glob('*.json'))) == 27
    for field in ['questionIndex', 'answerIndex']:
        positions = [question[field] for question in rows]
        assert sorted(set(positions)) == positions
    assert max(question['questionIndex'] for question in rows) < min(question['answerIndex'] for question in rows)
    assert sum(question['marker'] == '[X]' for question in rows) == 2
    assert any(block['kind'] == 'table' for block in rows[584]['explanation'])
    assert len(rows[1891]['explanation']) == 2
    assert rows[0]['source'] == '22년 경찰승진'
    print(f"Verified {len(rows)} questions, 3 stages and 27 chapter data files.")
    return rows


def verify_pair_layout(source, rows):
    with ZipFile(source) as archive:
        body = ET.fromstring(archive.read('Contents/section1.xml'))

    def vertical_position(paragraph):
        lines = next(child for child in body[paragraph] if tag(child) == 'linesegarray')
        return int(lines[0].get('vertpos'))

    left, right = ([vertical_position(row[field]) for row in rows] for field in ('questionIndex', 'answerIndex'))
    assert max(abs(a - b) for a, b in zip(left, right, strict=True)) <= 6000

    def column_resets(positions):
        return {index + 1 for index in range(1, len(positions)) if positions[index - 1] - positions[index] > 8000}

    # The chapter heading affects the large reset at no. 370 in the question column.
    assert column_resets(left) ^ column_resets(right) == {370}
    print('Checked the vertical alignment of all question and explanation pairs.')


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--source', type=Path)
    args = cli.parse_args()
    rows = verify(ROOT)
    if args.source:
        verify_pair_layout(args.source, rows)
        with TemporaryDirectory() as temporary:
            rebuilt = Path(temporary)
            extract(args.source, rebuilt)
            shipped = {path.relative_to(ROOT): path.read_bytes() for path in ROOT.rglob('*.json')}
            regenerated = {path.relative_to(rebuilt): path.read_bytes() for path in rebuilt.rglob('*.json')}
            assert regenerated == shipped, 'The generated data differs from the supplied HWPX.'
        print('The supplied HWPX re-extracts to byte-identical app data.')

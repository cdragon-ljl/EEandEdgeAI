# Bilibili Deep-Learning Lesson 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible local pipeline for Bilibili audio acquisition, Chinese transcription, PDF slide extraction/OCR, and deliver the publishable Lesson 1 learning-note draft.

**Architecture:** A small Python package under `scripts/deep_learning_notes/` owns deterministic source handling: the manifest validates the 43-video-to-27-lesson mapping, the downloader delegates media transport to `yt-dlp`, the transcriber wraps `faster-whisper`, and the PDF extractor uses `pypdf` plus OCR for image-only pages. Intermediate evidence stays under `tmp/deep-learning-notes/`; only the article and reusable scripts are publishable repository content.

**Tech Stack:** Python 3.11, pytest, yt-dlp, faster-whisper/CTranslate2, PyAV, pypdf, Pillow, RapidOCR, Markdown/Astro content collections.

---

## Scope

This plan implements the shared pipeline and Lesson 1 only. It does not start the remaining 26 articles before the Lesson 1 writing style, transcription quality, and source alignment have been reviewed. The later batch plan will reuse the tested scripts and the approved article structure.

## File Structure

- Create `scripts/deep_learning_notes/__init__.py`: package marker.
- Create `scripts/deep_learning_notes/requirements.txt`: isolated pipeline dependencies.
- Create `scripts/deep_learning_notes/course_manifest.json`: 27 lessons, 43 videos, PDF mapping, and overview-video metadata.
- Create `scripts/deep_learning_notes/manifest.py`: load and validate the manifest.
- Create `scripts/deep_learning_notes/download_audio.py`: construct and run safe single-video `yt-dlp` commands.
- Create `scripts/deep_learning_notes/transcribe.py`: transcribe one audio file and write timestamped JSON/Markdown.
- Create `scripts/deep_learning_notes/extract_pdf.py`: extract slide images and OCR text from image-based PDFs.
- Create `scripts/deep_learning_notes/validate_article.py`: check frontmatter, source URLs, placeholders, and lesson identity.
- Create `tests/deep_learning_notes/test_manifest.py`: mapping completeness and uniqueness tests.
- Create `tests/deep_learning_notes/test_download_audio.py`: downloader command and output-selection tests.
- Create `tests/deep_learning_notes/test_transcribe.py`: timestamp formatting and transcript serialization tests.
- Create `tests/deep_learning_notes/test_extract_pdf.py`: page-image selection and OCR-record tests.
- Create `tests/deep_learning_notes/test_validate_article.py`: article contract tests.
- Create `docs/articles/deep-learning/dl-01-neural-network-tensorflow.md`: Lesson 1 learning note.
- Generate `tmp/deep-learning-notes/lesson01/`: downloaded audio, transcript evidence, extracted slide images, OCR text, and review ledger. This directory is not committed.

### Task 1: Create the Isolated Pipeline Environment

**Files:**
- Create: `scripts/deep_learning_notes/__init__.py`
- Create: `scripts/deep_learning_notes/requirements.txt`

- [ ] **Step 1: Add the package marker and dependency list**

`scripts/deep_learning_notes/requirements.txt`:

```text
faster-whisper
Pillow
pypdf
pytest
rapidocr-onnxruntime
yt-dlp
```

`scripts/deep_learning_notes/__init__.py` remains empty.

- [ ] **Step 2: Create an isolated virtual environment**

Run:

```powershell
python -m venv tmp/deep-learning-notes/.venv
```

Expected: `tmp/deep-learning-notes/.venv/Scripts/python.exe` exists.

- [ ] **Step 3: Install only the pipeline dependencies**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pip install -r scripts/deep_learning_notes/requirements.txt
```

Expected: installation exits with code 0 and imports for `yt_dlp`, `faster_whisper`, `pypdf`, `PIL`, `rapidocr_onnxruntime`, and `pytest` succeed.

- [ ] **Step 4: Record resolved versions for reproducibility**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pip freeze
```

Expected: output contains the six direct dependencies and their transitive packages. Save the resolved direct versions back into `requirements.txt` before committing.

- [ ] **Step 5: Commit the isolated environment definition**

```powershell
git add scripts/deep_learning_notes/__init__.py scripts/deep_learning_notes/requirements.txt
git commit -m "build: add deep-learning notes pipeline dependencies"
```

### Task 2: Encode and Validate the Course Manifest

**Files:**
- Create: `scripts/deep_learning_notes/course_manifest.json`
- Create: `scripts/deep_learning_notes/manifest.py`
- Create: `tests/deep_learning_notes/test_manifest.py`

- [ ] **Step 1: Write the failing manifest tests**

```python
from scripts.deep_learning_notes.manifest import load_manifest, validate_manifest


def test_manifest_covers_course_without_duplicate_videos():
    manifest = load_manifest()
    validate_manifest(manifest)
    videos = [video["bvid"] for lesson in manifest["lessons"] for video in lesson["videos"]]
    assert len(manifest["lessons"]) == 27
    assert len(videos) == 42
    assert len(set(videos)) == 42
    assert manifest["overview_video"]["bvid"] == "BV1zu7868E5X"


def test_lesson_one_sources_are_exact():
    manifest = load_manifest()
    lesson = manifest["lessons"][0]
    assert lesson["lesson"] == 1
    assert lesson["pdfs"] == [
        "tmp/ppt/2026DL_lesson1_理论.pdf",
        "tmp/ppt/2026DL_lesson1_实操.pdf",
    ]
    assert [video["bvid"] for video in lesson["videos"]] == [
        "BV1QFLU6hELC",
        "BV13FLU6aEaK",
        "BV1LXLm6TEdK",
    ]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_manifest.py -v
```

Expected: FAIL because `manifest.py` does not exist.

- [ ] **Step 3: Implement manifest loading and validation**

```python
import json
from pathlib import Path


MANIFEST_PATH = Path(__file__).with_name("course_manifest.json")


def load_manifest(path: Path = MANIFEST_PATH) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_manifest(manifest: dict) -> None:
    lessons = manifest.get("lessons", [])
    if [item.get("lesson") for item in lessons] != list(range(1, 28)):
        raise ValueError("lessons must be numbered 1 through 27")
    bvids = [video.get("bvid") for lesson in lessons for video in lesson.get("videos", [])]
    if len(bvids) != 42 or len(set(bvids)) != 42:
        raise ValueError("lesson videos must contain 42 unique BVIDs")
    if not all(str(bvid).startswith("BV") for bvid in bvids):
        raise ValueError("every video must have a BVID")
```

Create `course_manifest.json` from the approved 27-row mapping in the design spec. Each video record must contain `bvid`, `title`, and `duration`; each lesson record must contain `lesson`, `slug`, `topic`, `pdfs`, and `videos`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_manifest.py -v
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit the manifest**

```powershell
git add scripts/deep_learning_notes/course_manifest.json scripts/deep_learning_notes/manifest.py tests/deep_learning_notes/test_manifest.py
git commit -m "feat: add validated deep-learning course manifest"
```

### Task 3: Implement Single-Video Audio Acquisition

**Files:**
- Create: `scripts/deep_learning_notes/download_audio.py`
- Create: `tests/deep_learning_notes/test_download_audio.py`

- [ ] **Step 1: Write failing command-construction tests**

```python
from pathlib import Path

from scripts.deep_learning_notes.download_audio import build_command


def test_build_command_downloads_one_audio_stream(tmp_path: Path):
    command = build_command("BV1QFLU6hELC", tmp_path)
    assert command[:3] == ["-m", "yt_dlp", "--no-playlist"]
    assert "bestaudio" in command
    assert command[-1] == "https://www.bilibili.com/video/BV1QFLU6hELC"
    assert str(tmp_path / "BV1QFLU6hELC.%(ext)s") in command
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_download_audio.py -v
```

Expected: FAIL because `download_audio.py` does not exist.

- [ ] **Step 3: Implement the downloader wrapper**

```python
import argparse
import subprocess
import sys
from pathlib import Path


def build_command(bvid: str, output_dir: Path) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    return [
        "-m", "yt_dlp", "--no-playlist", "--no-progress",
        "--format", "bestaudio", "--output", str(output_dir / f"{bvid}.%(ext)s"),
        f"https://www.bilibili.com/video/{bvid}",
    ]


def download(bvid: str, output_dir: Path) -> None:
    subprocess.run([sys.executable, *build_command(bvid, output_dir)], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("bvid")
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    download(args.bvid, args.output_dir)
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_download_audio.py -v
```

Expected: 1 test passes.

- [ ] **Step 5: Download the three Lesson 1 audio streams**

Run `download_audio.py` once for each Lesson 1 BVID, targeting `tmp/deep-learning-notes/lesson01/audio/`.

Expected: exactly three audio files exist; their combined media duration is approximately 4,126 seconds.

- [ ] **Step 6: Commit the downloader**

```powershell
git add scripts/deep_learning_notes/download_audio.py tests/deep_learning_notes/test_download_audio.py
git commit -m "feat: add Bilibili audio downloader"
```

### Task 4: Implement Timestamped Chinese Transcription

**Files:**
- Create: `scripts/deep_learning_notes/transcribe.py`
- Create: `tests/deep_learning_notes/test_transcribe.py`

- [ ] **Step 1: Write failing transcript-format tests**

```python
from scripts.deep_learning_notes.transcribe import format_timestamp, write_transcript


def test_format_timestamp_handles_hours():
    assert format_timestamp(65.2) == "00:01:05.200"
    assert format_timestamp(3661.5) == "01:01:01.500"


def test_write_transcript_emits_json_and_markdown(tmp_path):
    segments = [{"start": 0.0, "end": 2.5, "text": "神经网络由神经元组成。"}]
    write_transcript(tmp_path / "sample", "BVTEST", segments)
    assert '"bvid": "BVTEST"' in (tmp_path / "sample.json").read_text(encoding="utf-8")
    assert "[00:00:00.000 -> 00:00:02.500]" in (tmp_path / "sample.md").read_text(encoding="utf-8")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_transcribe.py -v
```

Expected: FAIL because `transcribe.py` does not exist.

- [ ] **Step 3: Implement transcription and serialization**

`transcribe.py` must:

- select CUDA/`float16` when CTranslate2 reports a CUDA device, otherwise CPU/`int8`;
- default to the `large-v3` model, `language="zh"`, `vad_filter=True`, and `beam_size=5`;
- accept an initial prompt containing `TensorFlow, Keras, ReLU, Sigmoid, Softmax, Fashion-MNIST, 反向传播, 梯度下降`;
- serialize every segment as `{start, end, text}` in UTF-8 JSON;
- emit a Markdown evidence file with `[HH:MM:SS.mmm -> HH:MM:SS.mmm] text` lines.

The reusable formatting functions must be:

```python
def format_timestamp(seconds: float) -> str:
    millis = round(seconds * 1000)
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def write_transcript(base_path, bvid, segments):
    payload = {"bvid": bvid, "segments": segments}
    base_path.with_suffix(".json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    lines = [
        f"[{format_timestamp(item['start'])} -> {format_timestamp(item['end'])}] {item['text']}"
        for item in segments
    ]
    base_path.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_transcribe.py -v
```

Expected: 2 tests pass.

- [ ] **Step 5: Transcribe the three Lesson 1 audio files**

Run the CLI once per audio file. Save evidence in `tmp/deep-learning-notes/lesson01/transcripts/` using the BVID as basename.

Expected: three JSON files and three Markdown files exist; every file has non-empty segments in chronological order.

- [ ] **Step 6: Spot-check transcription quality**

Check the first, middle, and final five minutes of every transcript against the audio and slides. Record corrections and unresolved low-confidence terms in `tmp/deep-learning-notes/lesson01/transcript-review.txt`.

- [ ] **Step 7: Commit the transcriber**

```powershell
git add scripts/deep_learning_notes/transcribe.py tests/deep_learning_notes/test_transcribe.py
git commit -m "feat: add timestamped Chinese transcription"
```

### Task 5: Extract and OCR Lesson 1 Slides

**Files:**
- Create: `scripts/deep_learning_notes/extract_pdf.py`
- Create: `tests/deep_learning_notes/test_extract_pdf.py`

- [ ] **Step 1: Write failing image-selection tests**

```python
from scripts.deep_learning_notes.extract_pdf import select_primary_image


class FakeImage:
    def __init__(self, name, data):
        self.name = name
        self.data = data


def test_select_primary_image_uses_largest_embedded_image():
    images = [FakeImage("watermark.jpg", b"x" * 10), FakeImage("slide.jpg", b"x" * 100)]
    assert select_primary_image(images).name == "slide.jpg"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_extract_pdf.py -v
```

Expected: FAIL because `extract_pdf.py` does not exist.

- [ ] **Step 3: Implement PDF extraction and OCR records**

`extract_pdf.py` must:

- load a PDF with `pypdf.PdfReader`;
- save the largest embedded image on each page as `page-001.<ext>`;
- run RapidOCR on each saved page image;
- write `ocr.json` records with `page`, `image`, `text`, and OCR confidence details;
- also capture the PDF text layer and exclude the repeated watermark `海归博士Dr.魏的高密乡` from lesson evidence;
- fail with a page-specific error if a page has no usable image and no usable text.

The image selection helper must be:

```python
def select_primary_image(images):
    if not images:
        return None
    return max(images, key=lambda image: len(image.data))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_extract_pdf.py -v
```

Expected: 1 test passes.

- [ ] **Step 5: Process both Lesson 1 PDFs**

Run the extractor for:

```text
tmp/ppt/2026DL_lesson1_理论.pdf
tmp/ppt/2026DL_lesson1_实操.pdf
```

Expected: 40 page images and two OCR JSON files under `tmp/deep-learning-notes/lesson01/slides/`; theory has 24 pages and practice has 16 pages.

- [ ] **Step 6: Visually inspect all 40 page images**

Compare OCR output with every page image. Correct formulae, code, package names, filesystem paths, and punctuation in `tmp/deep-learning-notes/lesson01/slide-review.txt`.

- [ ] **Step 7: Commit the PDF extractor**

```powershell
git add scripts/deep_learning_notes/extract_pdf.py tests/deep_learning_notes/test_extract_pdf.py
git commit -m "feat: add slide extraction and OCR"
```

### Task 6: Write and Validate the Lesson 1 Article

**Files:**
- Create: `scripts/deep_learning_notes/validate_article.py`
- Create: `tests/deep_learning_notes/test_validate_article.py`
- Create: `docs/articles/deep-learning/dl-01-neural-network-tensorflow.md`

- [ ] **Step 1: Write failing article-contract tests**

```python
from pathlib import Path

from scripts.deep_learning_notes.validate_article import validate_article


def test_lesson_one_article_contract():
    path = Path("docs/articles/deep-learning/dl-01-neural-network-tensorflow.md")
    errors = validate_article(path, lesson=1, expected_bvids={
        "BV1QFLU6hELC", "BV13FLU6aEaK", "BV1LXLm6TEdK"
    })
    assert errors == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes/test_validate_article.py -v
```

Expected: FAIL because the validator and article do not exist.

- [ ] **Step 3: Implement article validation**

`validate_article(path, lesson, expected_bvids)` must report errors when:

- required frontmatter keys `title`, `description`, `pubDate`, `series`, `order`, `tags`, or `draft` are absent;
- `series` is not `deep-learning` or `order` is not the expected lesson number;
- any expected BVID is absent, or an unexpected BVID appears;
- unresolved markers such as `TBD`, `TODO`, `待补充`, or `待核对` remain;
- the article lacks a summary, self-test section, or source section.

- [ ] **Step 4: Write the Lesson 1 article from aligned evidence**

Use this frontmatter contract:

```yaml
---
title: "神经网络与 TensorFlow/Keras 入门：从神经元到第一个分类模型"
description: "深度学习系统课 Lesson 1：神经元、激活函数、前向与反向传播，以及 TensorFlow/Keras 分类模型实操"
pubDate: "2026-08-23"
series: "deep-learning"
order: 1
tags: ["深度学习", "神经网络", "TensorFlow", "Keras"]
draft: true
---
```

Write a coherent learning note rather than a transcript. Cover the theory and practice PDFs, all three video transcripts, important setup commands, model/data flow, training loop, common mistakes, lesson summary, self-test questions, and the three source links. Attribute the course to its Bilibili creator.

- [ ] **Step 5: Run the validator and all pipeline tests**

Run:

```powershell
tmp/deep-learning-notes/.venv/Scripts/python.exe -m pytest tests/deep_learning_notes -v
```

Expected: all tests pass.

- [ ] **Step 6: Review article claims against timestamps and slides**

For each formula, code command, numerical claim, or instructor-specific recommendation, locate the supporting slide page or transcript timestamp. Record the evidence in `tmp/deep-learning-notes/lesson01/article-review.txt`; remove claims that cannot be supported.

- [ ] **Step 7: Commit the Lesson 1 draft and validator**

```powershell
git add scripts/deep_learning_notes/validate_article.py tests/deep_learning_notes/test_validate_article.py docs/articles/deep-learning/dl-01-neural-network-tensorflow.md
git commit -m "docs: add deep-learning lesson 1 draft"
```

### Task 7: Run Repository-Level Verification

**Files:**
- Modify: `docs/articles/deep-learning/dl-01-neural-network-tensorflow.md` only if verification finds issues.

- [ ] **Step 1: Inspect the final diff for unrelated changes**

Run:

```powershell
git status --short
git diff --check HEAD~4..HEAD
```

Expected: pipeline and Lesson 1 files are clean; pre-existing unrelated user changes remain untouched.

- [ ] **Step 2: Run the site checks using the repository's documented command**

Read `package.json` and run the existing build command without changing dependencies.

Expected: the site build exits with code 0 and the Lesson 1 Markdown is accepted by the content schema.

- [ ] **Step 3: Inspect the rendered Lesson 1 page**

Start the existing development server, open the generated article on desktop and mobile viewports, and verify that headings, tables, formulas, code blocks, source links, and long technical terms do not overflow or overlap.

- [ ] **Step 4: Mark the pilot ready for user review**

Keep `draft: true` until the user approves the article style. Report the article path, the three BVID sources, transcript/OCR caveats, test results, and the exact next step for lessons 2 through 27.

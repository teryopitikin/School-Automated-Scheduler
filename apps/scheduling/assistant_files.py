"""Turn a file uploaded in the assistant chat into Claude content blocks.

Spreadsheets (xlsx/xls) and text files (csv/txt) are rendered to plain
text so Claude can read them; PDFs and images are passed natively as
base64 document/image blocks.
"""
import base64
import csv
import io

MAX_UPLOAD_BYTES = 10 * 1024 * 1024   # 10 MB
MAX_TEXT_CHARS = 60_000               # cap for rendered spreadsheet/text

IMAGE_TYPES = {
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'gif': 'image/gif', 'webp': 'image/webp',
}


class AttachmentError(Exception):
    """User-facing problem with the uploaded file."""


def _sheet_to_csv(workbook):
    out = io.StringIO()
    writer = csv.writer(out)
    for ws in workbook.worksheets:
        writer.writerow([f'### Sheet: {ws.title}'])
        for row in ws.iter_rows(values_only=True):
            if any(v is not None and str(v).strip() != '' for v in row):
                writer.writerow(['' if v is None else v for v in row])
        writer.writerow([])
        if out.tell() > MAX_TEXT_CHARS:
            break
    return out.getvalue()


def _capped(text, name):
    if len(text) > MAX_TEXT_CHARS:
        return (text[:MAX_TEXT_CHARS]
                + f'\n… [truncated — {name} is larger than the chat can carry]')
    return text


def build_attachment_blocks(uploaded):
    """List of Claude content blocks for an uploaded file, or raises
    AttachmentError with a message safe to show the user."""
    if uploaded.size > MAX_UPLOAD_BYTES:
        raise AttachmentError(
            f'File is too large ({uploaded.size // (1024 * 1024)} MB) — '
            f'the limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.')

    name = uploaded.name or 'file'
    ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    data = uploaded.read()

    if ext in ('xlsx', 'xls'):
        import openpyxl
        try:
            wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True,
                                        data_only=True)
        except Exception:
            raise AttachmentError('Could not read that spreadsheet.')
        text = _capped(_sheet_to_csv(wb), name)
        return [{'type': 'text',
                 'text': f'[Attached spreadsheet: {name}]\n{text}'}]

    if ext in ('csv', 'txt'):
        text = _capped(data.decode('utf-8', errors='replace'), name)
        return [{'type': 'text', 'text': f'[Attached file: {name}]\n{text}'}]

    if ext == 'pdf':
        return [{'type': 'document', 'source': {
            'type': 'base64', 'media_type': 'application/pdf',
            'data': base64.b64encode(data).decode()}}]

    if ext in IMAGE_TYPES:
        return [{'type': 'image', 'source': {
            'type': 'base64', 'media_type': IMAGE_TYPES[ext],
            'data': base64.b64encode(data).decode()}}]

    raise AttachmentError(
        'Unsupported file type — attach an Excel/CSV, PDF, or image.')

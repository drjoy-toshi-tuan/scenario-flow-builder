import { describe, it, expect } from 'vitest';
import { utf8ToBase64, base64ToUtf8, sanitizeFileName, uniqueFileName, isYaml } from './api';

describe('base64 utf-8 round-trip', () => {
  it('giữ nguyên ký tự nhiều byte (tiếng Nhật/Việt)', () => {
    const samples = ['予約確認フロー', 'Tiếng Việt có dấu', 'plain ascii', '🙂 emoji', ''];
    for (const s of samples) {
      expect(base64ToUtf8(utf8ToBase64(s))).toBe(s);
    }
  });

  it('decode được base64 có xuống dòng (kiểu GitHub trả về)', () => {
    const b64 = utf8ToBase64('hello world');
    const withNewlines = b64.replace(/(.{4})/g, '$1\n');
    expect(base64ToUtf8(withNewlines)).toBe('hello world');
  });
});

describe('sanitizeFileName', () => {
  it('luôn có đuôi .yaml', () => {
    expect(sanitizeFileName('myflow')).toBe('myflow.yaml');
    expect(sanitizeFileName('myflow.yaml')).toBe('myflow.yaml');
    expect(sanitizeFileName('myflow.yml')).toBe('myflow.yml');
  });

  it('thay khoảng trắng và bỏ ký tự nguy hiểm', () => {
    expect(sanitizeFileName('my flow name')).toBe('my-flow-name.yaml');
    expect(sanitizeFileName('../../etc/passwd')).toBe('etcpasswd.yaml');
    expect(sanitizeFileName('a/b\\c.yaml')).toBe('abc.yaml');
  });

  it('không mở đầu bằng dấu chấm/gạch', () => {
    expect(sanitizeFileName('...hidden.yaml')).toBe('hidden.yaml');
    expect(sanitizeFileName('---x')).toBe('x.yaml');
  });

  it('trả tên mặc định khi rỗng', () => {
    expect(sanitizeFileName('   ')).toBe('flow.yaml');
    expect(sanitizeFileName('@@@')).toBe('flow.yaml');
  });

  it('giữ tên tiếng Nhật (mọi bảng chữ)', () => {
    expect(sanitizeFileName('新規予約フロー')).toBe('新規予約フロー.yaml');
    expect(sanitizeFileName('施設 予約')).toBe('施設-予約.yaml');
  });
});

describe('uniqueFileName', () => {
  it('giữ nguyên nếu chưa tồn tại', () => {
    expect(uniqueFileName('a.yaml', new Set())).toBe('a.yaml');
  });
  it('thêm hậu tố -2, -3 khi trùng', () => {
    expect(uniqueFileName('a.yaml', new Set(['a.yaml']))).toBe('a-2.yaml');
    expect(uniqueFileName('a.yaml', new Set(['a.yaml', 'a-2.yaml']))).toBe('a-3.yaml');
    expect(uniqueFileName('予約.yaml', new Set(['予約.yaml']))).toBe('予約-2.yaml');
  });
});

describe('isYaml', () => {
  it('nhận .yaml và .yml, không phân biệt hoa thường', () => {
    expect(isYaml('a.yaml')).toBe(true);
    expect(isYaml('a.YML')).toBe(true);
    expect(isYaml('a.json')).toBe(false);
    expect(isYaml('yaml')).toBe(false);
  });
});

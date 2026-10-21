import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readHtml(file) {
  return readFileSync(join(root, file), 'utf8');
}

function tagAttributes(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'))].map((match) => match[1]);
}

function attribute(attributes, name) {
  return attributes.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1];
}

test('HTML pages include a language, character set, viewport, and title', () => {
  for (const file of ['first.html', 'sec.html', 'table.html', 'assegment.html']) {
    const html = readHtml(file);
    assert.match(html, /<html\b[^>]*\blang=["'][^"']+["']/i, `${file} should declare a language`);
    assert.match(html, /<meta\b[^>]*\bcharset=["']?utf-8["']?/i, `${file} should declare UTF-8`);
    assert.match(html, /<meta\b[^>]*\bname=["']viewport["'][^>]*>/i, `${file} should include a viewport`);
    assert.match(html, /<title>\s*[^<]+\s*<\/title>/i, `${file} should have a non-empty title`);
  }
});

test('local links and media remain portable and point to existing files', () => {
  for (const file of ['first.html', 'sec.html', 'table.html', 'assegment.html']) {
    const html = readHtml(file);
    const references = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
      .map((match) => match[1])
      .filter((reference) => !/^(?:[a-z]+:|#|\/\/)/i.test(reference));

    for (const reference of references) {
      assert.ok(
        !reference.startsWith('/'),
        `${file} should use a relative path instead of ${reference}`,
      );

      const path = reference.split(/[?#]/, 1)[0];
      const resolvedPath = normalize(join(root, dirname(file), path));
      assert.ok(existsSync(resolvedPath), `${file} references missing ${reference}`);
    }
  }
});

test('video examples load predictably without forced playback', () => {
  const html = readHtml('first.html');
  const video = html.match(/<video\b([^>]*)>[\s\S]*?<\/video>/i)?.[0];
  const source = video?.match(/<source\b([^>]*)>/i)?.[1];

  assert.ok(video, 'first.html should include a video example');
  assert.match(video, /\bcontrols\b/i);
  assert.doesNotMatch(video, /\bautoplay\b/i);
  assert.equal(attribute(source, 'src'), 'B.mp4');
  assert.equal(attribute(source, 'type'), 'video/mp4');
  assert.match(video, /<a\s+href=["']B\.mp4["']>/i, 'video should include a download fallback');
});

test('form labels target unique controls', () => {
  for (const file of ['table.html', 'assegment.html']) {
    const html = readHtml(file);
    const ids = tagAttributes(html, '(?:input|select|textarea)')
      .map((attributes) => attribute(attributes, 'id'))
      .filter(Boolean);

    assert.equal(new Set(ids).size, ids.length, `${file} should not repeat control IDs`);

    for (const label of tagAttributes(html, 'label')) {
      const target = attribute(label, 'for');
      if (target) {
        assert.ok(ids.includes(target), `${file} label points to missing #${target}`);
      }
    }
  }
});

test('registration form exposes useful native validation and grouped choices', () => {
  const html = readHtml('table.html');
  const inputs = tagAttributes(html, 'input');
  const names = inputs.map((attributes) => attribute(attributes, 'name'));

  assert.match(html, /<form\b[^>]*>/i);
  assert.ok(inputs.some((attributes) => /\btype=["']email["']/i.test(attributes) && /\brequired\b/i.test(attributes)));
  assert.ok(inputs.some((attributes) => /\btype=["']password["']/i.test(attributes) && /\bminlength=["']8["']/i.test(attributes)));
  assert.equal(names.filter((name) => name === 'hobbies').length, 3);
  assert.equal(names.filter((name) => name === 'gender').length, 2);
  assert.match(html, /<button\b[^>]*\btype=["']submit["'][^>]*>/i);
});

test('data tables provide captions and row and column headers', () => {
  const html = readHtml('table.html');
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => match[1]);

  assert.equal(tables.length, 2);
  for (const table of tables) {
    assert.match(table, /<caption>\s*[^<]+\s*<\/caption>/i);
    assert.match(table, /<thead>[\s\S]*<\/thead>/i);
    assert.match(table, /<tbody>[\s\S]*<\/tbody>/i);
    assert.match(table, /<th\b[^>]*\bscope=["']col["']/i);
    assert.match(table, /<th\b[^>]*\bscope=["']row["']/i);
  }
});

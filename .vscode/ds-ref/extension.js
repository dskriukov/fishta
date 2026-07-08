const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const crypto = require('crypto');

const REFERENCE_KINDS = ['ds', 'ia', 'fix', 'fn', 'it', 'do', 'eg'];
const MARKER_KINDS = REFERENCE_KINDS;
const SENSE_FILE_EXTENSIONS = new Set(['.ds', '.ia', '.air', '.dsc', '.fix']);
const KIND_PATTERN = 'ds|ia|fix|fn|it|do|eg';
const INLINE_MARKER_RE = new RegExp(`\\[(${KIND_PATTERN}):([A-Za-z0-9_.-]+)\\]`);
const DSMAP_ENTRY_KIND_RE = `(?:${KIND_PATTERN})`;
const BUNDLED_CONTRACT_URI = 'vscode-extension:domain-sense/Domain Sense IA.md';
const BUNDLED_CONTRACT_RELATIVE_PATH = path.join('resources', 'domain-sense', 'Domain Sense IA.md');
const RESOLVED_CONTRACT_ARTIFACT = path.join('.vscode', 'domain-sense.resolved.json');

function isSenseDocument(doc) {
  return SENSE_FILE_EXTENSIONS.has(path.extname(doc.uri.fsPath).toLowerCase());
}

function getDescription(filePath, fullKey) {
  if (!fs.existsSync(filePath)) return '';
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const markerToken = `[${fullKey}]`;
  const markerIdx = lines.findIndex(l => l.includes(markerToken));
  if (markerIdx === -1) return '';
  const desc = [];
  for (let i = markerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (INLINE_MARKER_RE.test(line) || /^##\s/.test(line.trim())) break;
    if (line.startsWith('>')) continue; // пропускаем coduction-заметки
    desc.push(line);
  }
  while (desc.length && !desc[desc.length - 1].trim()) desc.pop();
  return desc.join('\n');
}

function findMarker(filePath, fullKey) {
  if (!fs.existsSync(filePath)) return undefined;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const markerToken = `[${fullKey}]`;
  const line = lines.findIndex(l => l.includes(markerToken));
  return line === -1 ? undefined : line;
}

function listFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) result.push(...listFiles(fullPath, suffix));
    else if (fullPath.endsWith(suffix)) result.push(fullPath);
  }
  return result;
}

function listAllFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) result.push(...listAllFiles(fullPath));
    else result.push(fullPath);
  }
  return result;
}

function listGitVisibleFiles(ws) {
  try {
    const output = childProcess.execFileSync('git', ['-C', ws, 'ls-files', '-co', '--exclude-standard'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(rel => path.join(ws, rel))
      .filter(filePath => {
        try {
          return fs.statSync(filePath).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return undefined;
  }
}

function listImplementationFiles(ws) {
  const files = listGitVisibleFiles(ws) || listAllFiles(ws);
  return files.filter(filePath => {
    const rel = relativePath(ws, filePath);
    if (rel.startsWith('.git/')) return false;
    if (rel.startsWith('ds/')) return false;
    if (rel.startsWith('.vscode/ds-ref/')) return false;
    return true;
  });
}

function rangeForLineOffsets(doc, line, start, end) {
  return new vscode.Range(doc.positionAt(doc.offsetAt(new vscode.Position(line, start))), doc.positionAt(doc.offsetAt(new vscode.Position(line, end))));
}

function fileLinkForRange(doc, line, start, end, targetPath) {
  return new vscode.DocumentLink(
    rangeForLineOffsets(doc, line, start, end),
    vscode.Uri.file(targetPath)
  );
}

function fileLinksForEntry(doc, entry) {
  if (!entry.fileRefText || entry.fileRefStart < 0 || entry.fileRefEnd < 0 || !entry.file) return [];
  if (entry.fileRefIsHash) {
    return [
      fileLinkForRange(doc, entry.line, entry.fileRefStart, entry.fileRefEnd, entry.file)
    ];
  }
  return [fileLinkForRange(doc, entry.line, entry.fileRefStart, entry.fileRefEnd, entry.file)];
}

function fileLinksForIndexEntry(doc, entry) {
  return [fileLinkForRange(doc, entry.line, entry.pathStart, entry.pathEnd, entry.file)];
}

function slugRangeForEntry(doc, entry) {
  return rangeForLineOffsets(doc, entry.line, entry.slugStart, entry.slugEnd);
}

function loadKeyMap(ws) {
  const map = {};
  const senseDir = path.join(ws, 'ds', 'sense');
  for (const filePath of [
    ...listFiles(senseDir, '.ds'),
    ...listFiles(senseDir, '.ia'),
    ...listFiles(path.join(ws, 'ds'), '.fix'),
  ]) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (let line = 0; line < lines.length; line++) {
      const m = lines[line].match(new RegExp(`\\[(${KIND_PATTERN}):([^\\]]+)\\]`));
      if (m) map[`${m[1]}:${m[2]}`] = { type: m[1], name: m[2], file: filePath, line };
    }
  }
  return map;
}

function loadSenseSlugs(ws) {
  const byType = {
    ds: new Set(),
    ia: new Set(),
    fix: new Set(),
    fn: new Set(),
    it: new Set(),
    do: new Set(),
    eg: new Set(),
  };
  const senseDir = path.join(ws, 'ds', 'sense');
  const files = [
    ...listFiles(senseDir, '.ds'),
    ...listFiles(senseDir, '.ia'),
    ...listFiles(path.join(ws, 'ds'), '.fix'),
  ];
  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const marker = line.match(INLINE_MARKER_RE);
      if (!marker) continue;
      const target = byType[marker[1]];
      if (target) target.add(marker[2]);
    }
  }
  return byType;
}

function buildCompletionIndex(ws, dsMapEntries) {
  const indexes = {
    ds: new Map(),
    ia: new Map(),
    fix: new Map(),
    fn: new Map(),
    it: new Map(),
    do: new Map(),
    eg: new Map(),
  };
  const senseSlugs = loadSenseSlugs(ws);

  for (const kind of MARKER_KINDS) {
    for (const name of senseSlugs[kind] || []) {
      indexes[kind].set(name, 'sense');
    }
  }

  for (const entry of dsMapEntries) {
    const target = indexes[entry.type];
    if (!target) continue;
    const source = target.has(entry.name) ? 'sense + .dsmap' : '.dsmap';
    target.set(entry.name, source);
  }

  const toArray = (map, type) => Array
    .from(map.entries())
    .map(([name, source]) => ({ name, source, type }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ds: toArray(indexes.ds, 'ds'),
    ia: toArray(indexes.ia, 'ia'),
    fix: toArray(indexes.fix, 'fix'),
    fn: toArray(indexes.fn, 'fn'),
    it: toArray(indexes.it, 'it'),
    do: toArray(indexes.do, 'do'),
    eg: toArray(indexes.eg, 'eg'),
  };
}

function queueSuggestCommand() {
  return {
    command: 'domain-sense.triggerSuggestAfterInsert',
    title: 'Trigger domain sense suggestions',
  };
}

function completionRangeFromMatch(position, matchText) {
  return new vscode.Range(
    new vscode.Position(position.line, position.character - matchText.length),
    position
  );
}

function makeRefTypeItems(range) {
  const make = (kind, detail) => {
    const item = new vscode.CompletionItem(`@${kind}:`, vscode.CompletionItemKind.Keyword);
    item.insertText = `@${kind}:`;
    item.range = range;
    item.detail = detail;
    item.documentation = new vscode.MarkdownString(detail);
    item.command = queueSuggestCommand();
    return item;
  };

  return [
    make('ds', 'ds: - описание предметной области'),
    make('ia', 'ia: - доопределение предметной области ИИ-агентом'),
    make('fix', 'fix: - требование ремонта или исправления'),
    make('fn', 'fn: - описание реализации метода'),
    make('do', 'do: - описание реализации алгоритма'),
    make('it', 'it: - описание свойства или набора свойств'),
    make('eg', 'eg: - постановка комплексной реализации'),
  ];
}

function makeMarkerTypeItems(range) {
  const markerItem = (kind, template, detail) => {
    const item = new vscode.CompletionItem(`[${kind}:...]`, vscode.CompletionItemKind.Snippet);
    item.insertText = new vscode.SnippetString(`[${kind}:\${1:${template}}]`);
    item.range = range;
    item.detail = detail;
    item.documentation = new vscode.MarkdownString(detail);
    item.command = queueSuggestCommand();
    return item;
  };

  return [
    markerItem('ds', 'module.topic', 'ds: - описание предметной области'),
    markerItem('ia', 'module.topic', 'ia: - доопределение предметной области ИИ-агентом'),
    markerItem('fix', 'module.issue', 'fix: - требование ремонта или исправления'),
    markerItem('fn', 'method-name', 'fn: - описание реализации метода'),
    markerItem('do', 'algorithm-name', 'do: - описание реализации алгоритма'),
    markerItem('it', 'property-group', 'it: - описание свойства или набора свойств'),
    markerItem('eg', 'example-name', 'eg: - постановка комплексной реализации'),
  ];
}

function normalizeDescriptionForSuggest(text) {
  return text
    // Убираем markdown hard-break в конце строк
    .replace(/\\\s*$/gm, '')
    // Приводим обычные markdown-списки к нормальной форме без code-block отступов
    .replace(/^\s{4}-\s+/gm, '- ')
    .replace(/^\s{8}-\s+/gm, '  - ')
    // Нормализуем экранированные маркеры списков
    .replace(/^\s*\\-\s+/gm, '- ')
    // Схлопываем длинные серии пустых строк
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function makeSlugItems(kind, candidates, prefix, range, keyMap) {
  const normalizedPrefix = (prefix || '').toLowerCase();
  const filtered = normalizedPrefix
    ? candidates.filter(item => item.name.toLowerCase().startsWith(normalizedPrefix))
    : candidates;

  return filtered.slice(0, 300).map((item) => {
    const fullKey = `${kind}:${item.name}`;
    const entry = keyMap?.[fullKey];
    const description = entry ? getDescription(entry.file, fullKey) : '';
    const completion = new vscode.CompletionItem(item.name, vscode.CompletionItemKind.Reference);
    completion.insertText = item.name;
    completion.range = range;
    completion.detail = `source: ${item.source}`;
    completion.filterText = `@${kind}:${item.name}`;
    completion.sortText = item.name;
    // Показываем только краткое первое описание блока без тела.
    if (description) {
      const normalizedDescription = normalizeDescriptionForSuggest(description);
      const briefDescription = normalizedDescription
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);

      if (briefDescription) {
        completion.documentation = new vscode.MarkdownString(briefDescription);
      }
    }
    return completion;
  });
}

function loadDsMapFiles(ws) {
  const refPath = path.join(ws, 'ds', '.dsmap');
  if (!fs.existsSync(refPath)) return { entries: [], byHash: {} };
  const lines = fs.readFileSync(refPath, 'utf8').split('\n');
  const entries = [];
  const byHash = {};
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    const m = text.match(/^(ds\/[A-Za-z0-9_./-]+)#([0-9a-f-]+)\s+-\s+([0-9a-f]{8})$/);
    if (!m) continue;
    const pathText = m[1];
    const consumedDigest = m[2];
    const hash = m[3];
    const pathStart = text.indexOf(pathText);
    const digestStart = text.indexOf(consumedDigest, pathStart + pathText.length + 1);
    const hashStart = text.indexOf(hash, pathStart + pathText.length);
    const entry = {
      pathText,
      consumedDigest,
      hash,
      file: path.join(ws, pathText),
      line,
      pathStart,
      pathEnd: pathStart + pathText.length,
      digestStart,
      digestEnd: digestStart + consumedDigest.length,
      hashStart,
      hashEnd: hashStart + hash.length,
    };
    entries.push(entry);
    byHash[hash] = entry;
  }
  return { entries, byHash };
}

function loadDsMapEntries(ws, fileIndexByHash = {}) {
  const refPath = path.join(ws, 'ds', '.dsmap');
  if (!fs.existsSync(refPath)) return [];
  const lines = fs.readFileSync(refPath, 'utf8').split('\n');
  const entries = [];
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    const m = text.match(new RegExp(`^${DSMAP_ENTRY_KIND_RE}:([A-Za-z0-9_.-]+)\\s+-\\s+([0-9a-f]{8})\\s+(\\S+)$`));
    if (!m) continue;
    const type = text.slice(0, text.indexOf(':'));
    const slug = `${type}:${m[1]}`;
    const hash = m[2];
    const fileRefText = m[3];
    const indexedFile = /^[0-9a-f]{8}$/.test(fileRefText) ? fileIndexByHash[fileRefText] : undefined;
    const file = indexedFile ? indexedFile.file : path.join(ws, fileRefText);
    const slugStart = text.indexOf(slug);
    const hashStart = text.indexOf(hash, slugStart + slug.length);
    const fileRefStart = text.indexOf(fileRefText, hashStart + hash.length);
    entries.push({
      type,
      name: m[1],
      slug,
      hash,
      file,
      line,
      slugStart,
      slugEnd: slugStart + slug.length,
      hashStart,
      hashEnd: hashStart + hash.length,
      fileRefText,
      fileRefStart,
      fileRefEnd: fileRefStart + fileRefText.length,
      fileRefIsHash: Boolean(indexedFile),
    });
  }
  return entries;
}

function stripQuotes(text) {
  const trimmed = text.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadAirMap(ws) {
  const map = {};
  const senseDir = path.join(ws, 'ds', 'sense');
  for (const filePath of listFiles(senseDir, '.air')) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    let current = null;
    let currentField = null;
    let currentFieldValue = [];
    let currentFieldIndent = 0;

    const flushField = () => {
      if (!current || !currentField) return;
      current[currentField] = currentFieldValue.join('\n').trim();
      currentField = null;
      currentFieldValue = [];
      currentFieldIndent = 0;
    };

    const flushEntry = () => {
      flushField();
      current = null;
    };

    for (let line = 0; line < lines.length; line++) {
      const raw = lines[line];
      const trimmed = raw.trim();

      if (/^\s*-\s+id:\s+\S+/.test(raw)) {
        flushEntry();
        const id = trimmed.replace(/^-\s+id:\s+/, '').trim();
        current = { id, file: filePath, line };
        map[id] = current;
        continue;
      }

      if (!current) continue;

      if (currentField && raw.startsWith(' '.repeat(currentFieldIndent))) {
        currentFieldValue.push(raw.slice(currentFieldIndent));
        continue;
      }

      const field = raw.match(/^\s{4}([A-Za-z_]+):\s*(.*)$/);
      if (field) {
        flushField();
        currentField = field[1];
        const value = field[2];
        const indent = raw.match(/^\s*/)[0].length + 2;
        if (value === '>' || value === '|') {
          currentFieldIndent = indent;
        } else {
          current[currentField] = stripQuotes(value);
          currentField = null;
        }
        continue;
      }

      if (/^\s*-[A-Za-z]/.test(raw) || /^\S+:/.test(raw)) {
        flushEntry();
      }
    }

    flushEntry();
  }
  return map;
}

function buildDsMapIndex(entries) {
  const byHash = {};
  const bySlug = {};
  for (const entry of entries) {
    byHash[entry.hash] = entry;
    bySlug[entry.slug] = entry;
  }
  return { byHash, bySlug };
}

function confidenceColor(confidence) {
  const value = String(confidence || '').toLowerCase();
  if (value === 'high') return '#2fb344';
  if (value === 'medium') return '#f59f00';
  if (value === 'low') return '#e03131';
  return '#868e96';
}

function renderAirDetails(entry, keyMap) {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.appendMarkdown(`**${entry.id}**\n\n`);
  if (entry.about) {
    md.appendMarkdown(`**about:** ${renderWithLinks(entry.about, keyMap)}\n\n`);
  }
  if (entry.decision) {
    md.appendMarkdown(`**decision:** ${renderWithLinks(entry.decision, keyMap)}\n\n`);
  }
  if (entry.confidence) {
    md.appendMarkdown(`**confidence:** <span style="color:${confidenceColor(entry.confidence)};font-weight:600;">${escapeMarkdown(entry.confidence)}</span>\n\n`);
  }
  if (entry.rationale) {
    md.appendMarkdown(`**rationale:** ${renderWithLinks(entry.rationale, keyMap)}\n\n`);
  }
  md.appendMarkdown(`[Open declaration](${locationUriForLine(entry.file, entry.line).toString()})`);
  return md;
}

function renderFileHashDetails(fileEntry, dsMapEntries, airMap) {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.appendMarkdown(`**${escapeMarkdown(fileEntry.hash)}**\n\n`);
  md.appendMarkdown(`Файл: [${escapeMarkdown(fileEntry.pathText)}](${vscode.Uri.file(fileEntry.file).toString()})\n\n`);

  const declared = dsMapEntries
    .filter(entry => path.resolve(entry.file) === path.resolve(fileEntry.file))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  if (!declared.length) {
    md.appendMarkdown('_Slug-ов для этого файла не найдено._');
    return md;
  }

  const renderList = (items) => items
    .map((entry) => `- [${escapeMarkdown(entry.slug)}](${declarationUriFor(entry, airMap).toString()})`)
    .join('\n');

  if (declared.length > 12) {
    md.appendMarkdown(`<details><summary>Slug-и (${declared.length})</summary>\n\n`);
    md.appendMarkdown(renderList(declared));
    md.appendMarkdown(`\n\n</details>`);
  } else {
    md.appendMarkdown(`Slug-и (${declared.length}):\n\n`);
    md.appendMarkdown(renderList(declared));
  }

  return md;
}

function renderHashOccurrences(entry, ws) {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.appendMarkdown(`**${entry.hash}**\n\n`);
  const occurrences = findHashOccurrences(ws, entry.hash);
  if (!occurrences.length) {
    md.appendMarkdown(`No implementation references found.`);
    return md;
  }
  md.appendMarkdown(`Implementation references:\n\n`);
  for (const occ of occurrences) {
    const rel = path.relative(ws, occ.filePath);
    const uri = locationUriForLine(occ.filePath, occ.line);
    const preview = escapeMarkdown(previewForOccurrence(occ.filePath, occ));
    md.appendMarkdown(`- [${escapeMarkdown(rel)}:${occ.line + 1}](${uri.toString()}) — ${preview}\n`);
  }
  return md;
}

function loadRefMap(ws, fileIndexByHash = {}) {
  const map = {};
  const refPaths = [
    path.join(ws, 'ds', '.dsmap'),
    path.join(ws, 'ds', 'ref'),
  ];
  const refPath = refPaths.find(candidate => fs.existsSync(candidate));
  if (!refPath) return map;
  for (const line of fs.readFileSync(refPath, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^${DSMAP_ENTRY_KIND_RE}:(\\S+)\\s+-\\s+([0-9a-f]+)\\s+(\\S+)`));
    if (!m) continue;
    const type = line.slice(0, line.indexOf(':'));
    const fileRef = m[3];
    const indexedFile = /^[0-9a-f]{8}$/.test(fileRef) ? fileIndexByHash[fileRef] : undefined;
    const file = indexedFile ? indexedFile.file : path.join(ws, fileRef);
    map[m[2]] = { type, name: m[1], file };
  }
  return map;
}

function findHashOccurrences(ws, hash) {
  const files = listImplementationFiles(ws);
  const occurrences = [];
  for (const filePath of files) {
    if (/node_modules/.test(filePath)) continue;
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let line = 0; line < lines.length; line++) {
      const lineText = lines[line];
      const annotationRe = new RegExp(`@(${KIND_PATTERN})\\b`, 'g');
      let annotation;
      while ((annotation = annotationRe.exec(lineText)) !== null) {
        let cursor = annotation.index + annotation[0].length;
        while (cursor < lineText.length && /\s/.test(lineText[cursor])) cursor++;
        while (cursor + 8 <= lineText.length) {
          const candidate = lineText.slice(cursor, cursor + 8);
          if (!/^[0-9a-f]{8}$/.test(candidate)) break;
          if (candidate === hash) {
            occurrences.push({
              filePath,
              line,
              start: cursor,
              end: cursor + 8,
            });
          }
          cursor += 8;
          while (cursor < lineText.length && /\s/.test(lineText[cursor])) cursor++;
        }
      }

      const directRe = new RegExp(`\\b(${KIND_PATTERN}):([0-9a-f]{8})\\b`, 'g');
      let direct;
      while ((direct = directRe.exec(lineText)) !== null) {
        if (direct[2] !== hash) continue;
        const start = direct.index + direct[0].indexOf(direct[2]);
        occurrences.push({
          filePath,
          line,
          start,
          end: start + 8,
        });
      }
    }
  }
  return occurrences;
}

function previewText(text) {
  return text.trimStart().slice(0, 50);
}

function isCommentOnlyLine(text) {
  const trimmed = text.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

function previewForOccurrence(filePath, occurrence) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const lineText = lines[occurrence.line] ?? '';
  const commentIndex = lineText.indexOf('//');

  if (commentIndex !== -1 && commentIndex < occurrence.start && lineText.slice(0, commentIndex).trim().length > 0) {
    return previewText(lineText.slice(0, commentIndex));
  }

  if (isCommentOnlyLine(lineText) || lineText.trim().length === 0) {
    for (let i = occurrence.line + 1; i < lines.length; i++) {
      const nextLine = lines[i];
      if (nextLine.trim().length === 0) continue;
      if (isCommentOnlyLine(nextLine)) continue;
      return previewText(nextLine);
    }
  }

  return previewText(lineText);
}

function findRefs(text) {
  const refs = [];
  const tokenRe = new RegExp(`@(${KIND_PATTERN})\\b`, 'g');
  let m;
  while ((m = tokenRe.exec(text)) !== null) {
    const type = m[1];
    let cursor = m.index + m[0].length;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    while (cursor + 8 <= text.length) {
      const hash = text.slice(cursor, cursor + 8);
      if (!/^[0-9a-f]{8}$/.test(hash)) break;
      refs.push({ type, hash, hashStart: cursor, hashEnd: cursor + 8 });
      cursor += 8;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    }
  }
  const directRe = new RegExp(`(${KIND_PATTERN}):([0-9a-f]{8})`, 'g');
  while ((m = directRe.exec(text)) !== null) {
    refs.push({ type: m[1], hash: m[2], hashStart: m.index + m[0].indexOf(m[2]), hashEnd: m.index + m[0].indexOf(m[2]) + 8 });
  }
  return refs;
}

function findKeyRefs(text) {
  const refs = [];
  const re = new RegExp(`@(${KIND_PATTERN}):([A-Za-z0-9_.-]+)`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = `${m[1]}:${m[2]}`;
    const keyStart = m.index + 1;
    refs.push({ key, keyStart, keyEnd: keyStart + key.length });
  }
  return refs;
}

function locationFor(entry) {
  const fullKey = `${entry.type}:${entry.name}`;
  const line = entry.line ?? findMarker(entry.file, fullKey) ?? 0;
  return new vscode.Location(vscode.Uri.file(entry.file), new vscode.Position(line, 0));
}

function declarationLocationFor(entry, airMap) {
  const fullKey = `${entry.type}:${entry.name}`;
  if (entry.type === 'ia' && airMap[fullKey]) {
    const airEntry = airMap[fullKey];
    return new vscode.Location(vscode.Uri.file(airEntry.file), new vscode.Position(airEntry.line, 0));
  }
  const markerLine = findMarker(entry.file, fullKey);
  const line = markerLine ?? 0;
  return new vscode.Location(vscode.Uri.file(entry.file), new vscode.Position(line, 0));
}

function declarationUriFor(entry, airMap) {
  const location = declarationLocationFor(entry, airMap);
  return location.uri.with({ fragment: `L${location.range.start.line + 1}` });
}

function locationUriForLine(filePath, line) {
  return vscode.Uri.file(filePath).with({ fragment: `L${line + 1}` });
}

function lineUri(doc, line, start, end) {
  return new vscode.Location(doc.uri, rangeForLineOffsets(doc, line, start, end));
}

function isDsMapDoc(doc) {
  return path.basename(doc.uri.fsPath) === '.dsmap';
}

function escapeMarkdown(text) {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
}

function renderWithLinks(text, keyMap) {
  const re = new RegExp(`@(${KIND_PATTERN}):([A-Za-z0-9_.\\-]+)`, 'g');
  let last = 0;
  let m;
  const parts = [];
  while ((m = re.exec(text)) !== null) {
    parts.push(escapeMarkdown(text.slice(last, m.index)));
    const key = `${m[1]}:${m[2]}`;
    const entry = keyMap[key];
    if (entry) {
      const uri = vscode.Uri.file(entry.file).with({ fragment: `L${entry.line + 1}` });
      parts.push(`[${key}](${uri.toString()})`);
    } else {
      parts.push(escapeMarkdown(m[0]));
    }
    last = m.index + m[0].length;
  }
  parts.push(escapeMarkdown(text.slice(last)));
  return parts.join('');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function countFiles(ws, suffix) {
  return listFiles(path.join(ws, 'ds'), suffix).length;
}

function summarizeDomainSenseStage(ws, keyMap, dsMapEntries, setup) {
  const hasDsMap = fs.existsSync(path.join(ws, 'ds', '.dsmap'));
  const hasDsr = countFiles(ws, '.dsr') > 0;
  const hasDsc = countFiles(ws, '.dsc') > 0;
  const hasAir = countFiles(ws, '.air') > 0;
  const requirementCount = Object.keys(keyMap).length;
  const linkedCount = dsMapEntries.length;

  let stage = 'INIT';
  let detail = 'Domain Sense structure is present, but compiled artifacts are not detected yet.';
  if (hasDsr && hasDsMap) {
    stage = 'DSR / IMP-ready';
    detail = 'Rendition artifacts and .dsmap are available for implementation work.';
  } else if (hasDsc || hasAir) {
    stage = 'DSC';
    detail = 'Coduction artifacts exist; rendition may be the next step.';
  } else if (requirementCount > 0) {
    stage = 'DS';
    detail = 'Sense requirements are available for review and coduction.';
  }

  return {
    stage,
    detail,
    hasDsMap,
    hasDsr,
    hasDsc,
    hasAir,
    requirementCount,
    linkedCount,
    setup,
    files: {
      ds: countFiles(ws, '.ds'),
      ia: countFiles(ws, '.ia'),
      fix: countFiles(ws, '.fix'),
      dsc: countFiles(ws, '.dsc'),
      dsr: countFiles(ws, '.dsr'),
      air: countFiles(ws, '.air'),
      dsmap: hasDsMap ? 1 : 0,
    },
  };
}

function renderStageHtml(summary) {
  const missing = [];
  if (!summary.hasDsc) missing.push('DSC');
  if (!summary.hasDsr) missing.push('DSR');
  if (!summary.hasDsMap) missing.push('.dsmap');
  const readiness = missing.length ? `missing ${missing.join(', ')}` : 'ready for REF/IMP checks';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { padding: 10px 12px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    .stage { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
    .detail { color: var(--vscode-descriptionForeground); line-height: 1.4; margin-bottom: 12px; }
    .metrics { display: grid; gap: 6px; }
    .metric { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px 8px; display: flex; justify-content: space-between; }
    .metric span { color: var(--vscode-descriptionForeground); }
    .muted { margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .setup { margin-top: 10px; display: grid; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  </style>
</head>
<body>
  <div class="stage">${escapeHtml(summary.stage)}</div>
  <div class="detail">${escapeHtml(summary.detail)}</div>
  <div class="metrics">
    <div class="metric"><span>readiness</span><strong>${escapeHtml(readiness)}</strong></div>
    <div class="metric"><span>compiled layers</span><strong>${summary.files.dsc}/${summary.files.dsr}</strong></div>
  </div>
  <div class="setup">
    <div>Contract: ${escapeHtml(summary.setup?.contract.ref || 'unknown')} (${summary.setup?.contract.exists ? 'found' : 'missing'})</div>
    <div>Config: ${escapeHtml(summary.setup?.config.ref || 'ds.config.md')} (${summary.setup?.config.exists ? 'found' : 'missing'})</div>
  </div>
  <div class="muted">Index: ${summary.requirementCount} markers, ${summary.linkedCount} .dsmap links.</div>
</body>
</html>`;
}

function renderActionsHtml() {
  const actions = [
    ['domain-sense.generateAgents', 'AGENTS', 'create/update DS connector'],
    ['domain-sense.runDS', 'DS', 'review requirements'],
    ['domain-sense.runDSC', 'DSC', 'coduct requirements'],
    ['domain-sense.runDSR', 'DSR', 'prepare rendition'],
    ['domain-sense.runIMP', 'IMP', 'implement from DSR'],
    ['domain-sense.runFIX', 'FIX', 'normalize and repair'],
    ['domain-sense.runREF', 'REF', 'check requirement links'],
  ];
  const buttons = actions
    .map(([command, label, hint]) => `<button data-command="${command}"><strong>${label}</strong><span>${hint}</span></button>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { padding: 10px 12px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    .grid { display: grid; gap: 8px; }
    button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; text-align: left; cursor: pointer; }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    strong { display: block; font-size: 13px; }
    span { display: block; color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="grid">${buttons}</div>
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
    });
  </script>
</body>
</html>`;
}

function relativePath(ws, filePath) {
  return path.relative(ws, filePath).replace(/\\/g, '/');
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readDeclaredValue(text, label) {
  const re = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.+?)\\s*$`, 'mi');
  const match = text.match(re);
  return match ? match[1].trim() : '';
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function extensionIdForContext(context) {
  const pkg = context.extension?.packageJSON || {};
  if (context.extension?.id) return context.extension.id;
  if (pkg.publisher && pkg.name) return `${pkg.publisher}.${pkg.name}`;
  return pkg.name || 'unknown';
}

function writeResolvedContractArtifact(ws, setup, context) {
  const artifactPath = path.join(ws, RESOLVED_CONTRACT_ARTIFACT);
  const contractText = setup.contract.exists ? readFileSafe(setup.contract.file) : '';
  const pkg = context.extension?.packageJSON || {};
  const artifact = {
    schema: 'domain-sense.resolved-contract.v1',
    contractUri: setup.contract.ref,
    source: setup.contract.ref === BUNDLED_CONTRACT_URI ? 'active-vscode-extension' : setup.contract.source,
    extensionId: extensionIdForContext(context),
    extensionVersion: pkg.version || '',
    extensionPath: context.extensionPath,
    contractPath: setup.contract.file || '',
    contractExists: Boolean(setup.contract.exists),
    contractSha256: contractText ? sha256(contractText) : '',
    contractText,
  };
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifactPath;
}

function resolveDomainSenseSetup(ws, extensionPath) {
  const agentsPath = path.join(ws, 'AGENTS.md');
  const agentsText = readFileSafe(agentsPath);
  const declaredContract = readDeclaredValue(agentsText, 'DS contract');
  const declaredConfig = readDeclaredValue(agentsText, 'DS config');
  const bundledPath = path.join(extensionPath, BUNDLED_CONTRACT_RELATIVE_PATH);
  const workspaceContractPath = path.join(ws, 'ds', 'Domain Sense IA.md');

  let contract = {
    ref: declaredContract || BUNDLED_CONTRACT_URI,
    source: 'bundled',
    file: bundledPath,
    exists: fs.existsSync(bundledPath),
    detail: 'bundled extension contract',
  };

  if (declaredContract && declaredContract !== BUNDLED_CONTRACT_URI) {
    const maybeWorkspacePath = declaredContract.startsWith('vscode-extension:')
      ? ''
      : path.resolve(ws, declaredContract);
    contract = {
      ref: declaredContract,
      source: declaredContract.startsWith('vscode-extension:') ? 'unsupported extension uri' : 'workspace',
      file: maybeWorkspacePath,
      exists: maybeWorkspacePath ? fs.existsSync(maybeWorkspacePath) : false,
      detail: declaredContract.startsWith('vscode-extension:')
        ? 'extension URI is not provided by this extension'
        : 'workspace contract override',
    };
  } else if (!declaredContract && fs.existsSync(workspaceContractPath)) {
    contract = {
      ref: 'ds/Domain Sense IA.md',
      source: 'workspace',
      file: workspaceContractPath,
      exists: true,
      detail: 'legacy workspace contract',
    };
  }

  const configPath = declaredConfig ? path.resolve(ws, declaredConfig) : path.join(ws, 'ds.config.md');
  const config = {
    ref: declaredConfig || 'ds.config.md',
    file: configPath,
    exists: fs.existsSync(configPath),
    detail: declaredConfig ? 'declared workspace config' : 'default workspace config path',
  };

  return { contract, config };
}

function ensureAgentsContract(ws) {
  const agentsPath = path.join(ws, 'AGENTS.md');
  const existing = readFileSafe(agentsPath);
  const trimmed = existing.trim();
  const hasHeading = /^#\s+AGENTS\.md\b/m.test(existing);
  let text = trimmed || '# AGENTS.md';

  if (!hasHeading && trimmed) {
    text = `# AGENTS.md\n\n${text}`;
  }

  if (!/^DS contract:\s*/mi.test(text)) {
    text = text.replace(/^#\s+AGENTS\.md\b[^\n]*\n?/m, match => `${match.trimEnd()}\n\nDS contract: ${BUNDLED_CONTRACT_URI}\n`);
  } else {
    text = text.replace(/^DS contract:\s*.*$/mi, `DS contract: ${BUNDLED_CONTRACT_URI}`);
  }

  if (!/^DS config:\s*/mi.test(text)) {
    const contractLine = new RegExp(`^DS contract:\\s*${BUNDLED_CONTRACT_URI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi');
    text = text.replace(contractLine, `DS contract: ${BUNDLED_CONTRACT_URI}\nDS config: ds.config.md`);
  } else {
    text = text.replace(/^DS config:\s*.*$/mi, 'DS config: ds.config.md');
  }

  if (!/resolved DS contract and local DS config/i.test(text)) {
    text += '\n\nIf a request does not start with `~`, or if `~ds` is used later in the same chat, then the resolved DS contract and local DS config are mandatory for all work in this repository. Follow them fully.';
  }

  if (!/~ds` command must print the list of DS commands/i.test(text)) {
    text += '\n\nIn any modality, the `~ds` command must print the list of DS commands with a very brief reminder of what each command does, and then switch the chat back to DS-first mode.';
  }

  if (!/applicable DS command gate/i.test(text)) {
    text += '\n\nBefore editing files, identify the applicable DS command gate from the resolved DS contract and local DS config, then follow that gate instead of generic coding behavior.';
  }

  if (!/domain-sense\.resolved\.json/i.test(text)) {
    text += '\n\nAgents that cannot resolve `vscode-extension:` URIs natively must use the active Domain Sense extension resolver artifact at `.vscode/domain-sense.resolved.json`. The artifact must be generated by the active extension and must resolve the exact declared DS contract URI. Do not use workspace copies as contract fallbacks.';
  }

  const next = `${text.trim()}\n`;
  fs.writeFileSync(agentsPath, next, 'utf8');
  return {
    file: agentsPath,
    changed: next !== existing,
    created: !existing,
  };
}

function writePanelIntake(ws, type, text) {
  const body = String(text || '').trim();
  if (!body) return;

  const fixDir = path.join(ws, 'ds', 'fix');
  fs.mkdirSync(fixDir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (type === 'bug') {
    fs.appendFileSync(path.join(fixDir, 'bug.fix'), `\n- [ ] [bug]: ${body}\n  Source: Domain Sense Panel, ${stamp}\n`);
    return;
  }

  if (type === 'fix') {
    fs.appendFileSync(path.join(fixDir, 'panel.fix'), `\n- [ ] [fix]: ${body}\n  Source: Domain Sense Panel, ${stamp}\n`);
    return;
  }

  fs.appendFileSync(path.join(fixDir, 'panel-tasks.fix'), `\n- [ ] [task]: ${body}\n  Source: Domain Sense Panel, ${stamp}\n`);
}

function firstLines(text, count = 2) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(' ');
}

function loadRequirementBlocks(ws, keyMap) {
  return Object.entries(keyMap)
    .map(([key, entry]) => ({
      key,
      file: entry.file,
      line: entry.line,
      rel: relativePath(ws, entry.file),
      summary: firstLines(getDescription(entry.file, key), 1),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function collectSenseRefs(ws) {
  const files = [
    ...listFiles(path.join(ws, 'ds', 'sense'), '.ds'),
    ...listFiles(path.join(ws, 'ds', 'sense'), '.ia'),
    ...listFiles(path.join(ws, 'ds', 'sense'), '.dsc'),
    ...listFiles(path.join(ws, 'ds', 'sense'), '.air'),
    ...listFiles(path.join(ws, 'ds'), '.fix'),
  ];
  const refs = [];
  const re = /@(ds|ia|fix|fn|it|do|eg):([A-Za-z0-9_.-]+)/g;
  for (const filePath of files) {
    const lines = readFileSafe(filePath).split('\n');
    for (let line = 0; line < lines.length; line++) {
      let m;
      while ((m = re.exec(lines[line])) !== null) {
        refs.push({ key: `${m[1]}:${m[2]}`, type: m[1], file: filePath, line });
      }
    }
  }
  return refs;
}

function collectChecklistItems(ws) {
  const files = listFiles(path.join(ws, 'ds'), '.fix');
  const items = [];
  for (const filePath of files) {
    const lines = readFileSafe(filePath).split('\n');
    for (let line = 0; line < lines.length; line++) {
      const m = lines[line].match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
      if (!m) continue;
      const text = m[2].replace(/\\$/, '').trim();
      const slug = text.match(/\*\*\[(bug|fix):([^\]]+)\]\*\*/);
      const intake = text.match(/\[(bug|fix|task)\]:\s*(.*)$/);
      items.push({
        done: m[1].toLowerCase() === 'x',
        kind: slug?.[1] || intake?.[1] || 'task',
        slug: slug ? `${slug[1]}:${slug[2]}` : '',
        text: slug ? text.replace(/\*\*\[[^\]]+\]\*\*\\?/, '').trim() : (intake?.[2] || text),
        file: filePath,
        line,
        rel: relativePath(ws, filePath),
      });
    }
  }
  return items;
}

function collectUnnormalizedIntake(ws) {
  const items = [];
  const re = /(^|\s)(?:\/\/|#)?\s*\[(bug|fix)\]:\s*(.+)$/;
  for (const filePath of listImplementationFiles(ws)) {
    const rel = relativePath(ws, filePath);
    if (rel.endsWith('.md')) continue;
    const lines = readFileSafe(filePath).split('\n');
    for (let line = 0; line < lines.length; line++) {
      const m = lines[line].match(re);
      if (!m) continue;
      const kind = m[2];
      const allowedBug = rel === 'ds/fix/bug.fix';
      const allowedFix = rel.startsWith('ds/') && rel.endsWith('.fix') && rel !== 'ds/fix/bug.fix';
      if ((kind === 'bug' && allowedBug) || (kind === 'fix' && allowedFix)) continue;
      items.push({ kind, file: filePath, line, rel, text: m[3].trim() });
    }
  }
  return items;
}

function fileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function newestMtime(files) {
  return files.reduce((max, filePath) => Math.max(max, fileMtime(filePath)), 0);
}

function collectStaleLayers(ws) {
  const dsSources = [
    ...listFiles(path.join(ws, 'ds', 'sense'), '.ds'),
    ...listFiles(path.join(ws, 'ds', 'sense'), '.ia'),
    ...listFiles(path.join(ws, 'ds'), '.fix'),
  ];
  const dscFiles = listFiles(path.join(ws, 'ds', 'sense'), '.dsc');
  const airFiles = listFiles(path.join(ws, 'ds', 'sense'), '.air');
  const dsrFiles = listFiles(path.join(ws, 'ds', 'dsr'), '.dsr');
  const sourceTime = newestMtime(dsSources);
  const dscTime = newestMtime(dscFiles);
  const airTime = newestMtime(airFiles);
  const dsrTime = newestMtime(dsrFiles);

  const stale = [];
  if (sourceTime && dscTime && sourceTime > dscTime) stale.push('DSC may be stale after source requirement changes.');
  if (sourceTime && dsrTime && sourceTime > dsrTime) stale.push('DSR may be stale after source requirement changes.');
  if (dscTime && dsrTime && Math.max(dscTime, airTime) > dsrTime) stale.push('DSR may be stale after DSC/AIR changes.');
  if (!dsrFiles.length) stale.push('No DSR files detected.');
  return stale;
}

function parseAirBulletText(text) {
  return stripQuotes(String(text || '').replace(/\s+#.*$/, '').trim());
}

function collectAirLedger(ws) {
  const airFiles = listFiles(path.join(ws, 'ds', 'sense'), '.air');
  const dsrFiles = listFiles(path.join(ws, 'ds', 'dsr'), '.dsr');
  const files = [];
  const decisions = [];
  const grooming = [];
  const dsrRefsByFile = new Map(airFiles.map(filePath => [filePath, []]));

  for (const dsrFile of dsrFiles) {
    const lines = readFileSafe(dsrFile).split('\n');
    for (let line = 0; line < lines.length; line++) {
      const lower = lines[line].toLowerCase();
      for (const airFile of airFiles) {
        const base = path.basename(airFile).toLowerCase();
        const relFromDs = relativePath(path.join(ws, 'ds'), airFile).toLowerCase();
        const relFromSense = relativePath(path.join(ws, 'ds', 'sense'), airFile).toLowerCase();
        if (!lower.includes(base) && !lower.includes(relFromDs) && !lower.includes(relFromSense)) continue;
        dsrRefsByFile.get(airFile).push({
          file: dsrFile,
          rel: relativePath(ws, dsrFile),
          line,
          preview: lines[line].trim(),
        });
      }
    }
  }

  for (const filePath of airFiles) {
    const lines = readFileSafe(filePath).split('\n');
    const fileInfo = {
      file: filePath,
      rel: relativePath(ws, filePath),
      lineCount: lines.filter(line => line.trim()).length,
      decisions: [],
      notes: [],
      questions: [],
      structured: [],
      dsrRefs: dsrRefsByFile.get(filePath) || [],
    };
    let section = '';
    let currentDecision = null;

    const finishDecision = () => {
      if (!currentDecision) return;
      fileInfo.decisions.push(currentDecision);
      decisions.push(currentDecision);
      if (!currentDecision.confidence) {
        grooming.push({
          kind: 'confidence',
          title: 'Accepted interpretation has no confidence',
          detail: currentDecision.text,
          file: filePath,
          line: currentDecision.line,
        });
      }
      currentDecision = null;
    };

    for (let line = 0; line < lines.length; line++) {
      const raw = lines[line];
      const top = raw.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*$/);
      if (top) {
        finishDecision();
        section = top[1];
        continue;
      }

      if (section === 'accepted_interpretations') {
        const decision = raw.match(/^\s{2}-\s+decision:\s*(.*)$/);
        if (decision) {
          finishDecision();
          currentDecision = {
            text: parseAirBulletText(decision[1]),
            confidence: '',
            rationale: '',
            file: filePath,
            rel: fileInfo.rel,
            line,
          };
          continue;
        }
        if (currentDecision) {
          const confidence = raw.match(/^\s{4}confidence:\s*(.*)$/);
          const rationale = raw.match(/^\s{4}rationale:\s*(.*)$/);
          if (confidence) currentDecision.confidence = parseAirBulletText(confidence[1]);
          if (rationale) currentDecision.rationale = parseAirBulletText(rationale[1]);
        }
        continue;
      }

      finishDecision();

      if (section === 'rationale_notes') {
        const note = raw.match(/^\s{2}-\s+(.*)$/);
        if (note) fileInfo.notes.push({ text: parseAirBulletText(note[1]), file: filePath, rel: fileInfo.rel, line });
        continue;
      }

      if (section === 'open_questions') {
        const question = raw.match(/^\s{2}-\s+(.*)$/);
        if (question) {
          const item = { text: parseAirBulletText(question[1]), file: filePath, rel: fileInfo.rel, line };
          fileInfo.questions.push(item);
          grooming.push({
            kind: 'question',
            title: 'Open AIR question',
            detail: item.text,
            file: filePath,
            line,
          });
        }
        continue;
      }

      if (['terminology', 'tunables', 'constraints', 'input_bindings', 'architectural_assumptions'].includes(section)) {
        const structured = raw.match(/^\s{2}(?:-\s+)?(.+)$/);
        if (structured && structured[1].trim()) {
          fileInfo.structured.push({ section, text: parseAirBulletText(structured[1]), file: filePath, rel: fileInfo.rel, line });
        }
      }
    }

    finishDecision();

    if (!fileInfo.decisions.length && fileInfo.notes.length) {
      grooming.push({
        kind: 'promote',
        title: 'Only rationale notes, no accepted decisions',
        detail: `${fileInfo.notes.length} note(s) may need grooming into stable decisions.`,
        file: filePath,
        line: fileInfo.notes[0].line,
      });
    }

    if (!fileInfo.dsrRefs.length) {
      grooming.push({
        kind: 'dsr',
        title: 'AIR file is not referenced by DSR',
        detail: fileInfo.rel,
        file: filePath,
        line: 0,
      });
    }

    files.push(fileInfo);
  }

  const confidenceCounts = decisions.reduce((counts, decision) => {
    const key = decision.confidence || 'missing';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  return {
    files,
    decisions,
    grooming,
    noteCount: files.reduce((sum, file) => sum + file.notes.length, 0),
    questionCount: files.reduce((sum, file) => sum + file.questions.length, 0),
    structuredCount: files.reduce((sum, file) => sum + file.structured.length, 0),
    dsrRefCount: files.reduce((sum, file) => sum + file.dsrRefs.length, 0),
    referencedFileCount: files.filter(file => file.dsrRefs.length).length,
    confidenceCounts,
  };
}

function findSourceBoundaryInFile(filePath) {
  const text = readFileSafe(filePath);
  if (!text.trim()) {
    return {
      present: false,
      file: filePath,
      line: 0,
      detail: `${path.basename(filePath)} is missing or empty.`,
    };
  }

  const lines = text.split('\n');
  const markerRe = /\[(ds|ia):([A-Za-z0-9_.-]+)\]/;
  const acceptedMarker = /(?:implementation|source|code).*(?:structure|layout|tree|files|dirs|directories|entry|entries|sources)|(?:structure|layout|tree|files|dirs|directories|entry|entries|sources).*(?:implementation|source|code)/i;
  for (let line = 0; line < lines.length; line++) {
    const marker = lines[line].match(markerRe);
    if (!marker || !acceptedMarker.test(marker[2])) continue;
    return { present: true, file: filePath, line };
  }

  const headingRe = /^#{1,3}\s+(?:existing\s+implementation|implementation\s+structure|source\s+code\s+structure|source\s+layout|code\s+layout|исходн\w*\s+код\w*|структур\w*\s+исходн\w*|структур\w*\s+код\w*)/i;
  for (let line = 0; line < lines.length; line++) {
    if (!headingRe.test(lines[line].trim())) continue;
    const body = lines.slice(line + 1, line + 12).join('\n');
    if (/(^|\n)\s*[-*]\s+[`']?[^`'\n]+\.(js|ts|tsx|jsx|css|html|py|swift|kt|java|go|rs)\b/i.test(body)) {
      return { present: true, file: filePath, line };
    }
    if (/(^|\n)\s*[-*]\s+[`']?[^`'\n]+\/\s*[-–—:]/.test(body)) {
      return { present: true, file: filePath, line };
    }
  }

  const fallbackLine = lines.findIndex(line => /^#\s+/.test(line.trim()));
  return {
    present: false,
    file: filePath,
    line: fallbackLine >= 0 ? fallbackLine : 0,
    detail: `Describe the executable source boundary in ${path.basename(filePath)} before implementation files are scanned.`,
  };
}

function findExecutableSourceBoundary(ws, setup) {
  const candidates = [
    path.join(ws, 'ds', 'sense', 'main.ds'),
    setup?.config?.file,
  ].filter(Boolean);

  let firstMissing = undefined;
  for (const filePath of candidates) {
    const result = findSourceBoundaryInFile(filePath);
    if (result.present) return result;
    if (!firstMissing) firstMissing = result;
  }

  return {
    ...(firstMissing || { file: path.join(ws, 'ds', 'sense', 'main.ds'), line: 0 }),
    present: false,
    detail: 'Describe the executable source boundary in ds.config.md or ds/sense/main.ds before implementation files are scanned.',
  };
}

function collectCodeLinkIssues(ws, dsMapIndex) {
  const issues = [];
  const codeExt = new Set(['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.py', '.swift', '.kt', '.java', '.go', '.rs']);
  for (const filePath of listImplementationFiles(ws)) {
    const rel = relativePath(ws, filePath);
    if (!codeExt.has(path.extname(filePath).toLowerCase())) continue;
    const lines = readFileSafe(filePath).split('\n');
    for (let line = 0; line < lines.length; line++) {
      for (const ref of findRefs(lines[line])) {
        if (!dsMapIndex.byHash[ref.hash]) {
          issues.push({ rel, line, text: `Unknown ${ref.type} hash ${ref.hash}` });
        }
      }
      const slugRef = lines[line].match(/\b(?:@)?(ds|ia|fix|fn|it|do|eg):([A-Za-z0-9_.-]+)/);
      if (slugRef && !/:[0-9a-f]{8}\b/.test(slugRef[0])) {
        issues.push({ rel, line, text: `Slug-style implementation link ${slugRef[0]} should be SHA-only.` });
      }
    }
  }
  return issues;
}

function fixCodeLinkIssues(ws, dsMapIndex) {
  const codeExt = new Set(['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.py', '.swift', '.kt', '.java', '.go', '.rs']);
  let changedFiles = 0;
  let changedRefs = 0;

  for (const filePath of listImplementationFiles(ws)) {
    const rel = relativePath(ws, filePath);
    if (!codeExt.has(path.extname(filePath).toLowerCase())) continue;

    const text = readFileSafe(filePath);
    const next = text.replace(/\b@?(ds|ia|fix|fn|it|do|eg):([A-Za-z0-9_.-]+)/g, (match, kind, name) => {
      if (/^[0-9a-f]{8}$/.test(name)) return match;
      const entry = dsMapIndex.bySlug[`${kind}:${name}`];
      if (!entry) return match;
      changedRefs += 1;
      return `${kind}:${entry.hash}`;
    });

    if (next !== text) {
      fs.writeFileSync(filePath, next, 'utf8');
      changedFiles += 1;
    }
  }

  return { changedFiles, changedRefs };
}

function loadPanelData(ws, summary, keyMap, dsMapEntries, dsMapIndex) {
  const requirements = loadRequirementBlocks(ws, keyMap);
  const dsMapSlugs = new Set(dsMapEntries.map(entry => entry.slug));
  const refs = collectSenseRefs(ws);
  const unresolvedRefs = refs.filter(ref => !keyMap[ref.key] && !dsMapSlugs.has(ref.key));
  const unregistered = requirements.filter(req => !dsMapSlugs.has(req.key));
  const checklistItems = collectChecklistItems(ws);
  const openItems = checklistItems.filter(item => !item.done);
  const stale = collectStaleLayers(ws);
  const airFiles = listFiles(path.join(ws, 'ds', 'sense'), '.air');
  const airText = airFiles.map(readFileSafe).join('\n');
  const airLedger = collectAirLedger(ws);
  const dscFiles = listFiles(path.join(ws, 'ds', 'sense'), '.dsc');
  const dsrFiles = listFiles(path.join(ws, 'ds', 'dsr'), '.dsr');
  const sourceStructure = findExecutableSourceBoundary(ws, summary.setup);

  if (!sourceStructure.present) {
    return {
      summary,
      requirements,
      senseErrors: [{
        severity: 'error',
        title: 'Executable source boundary must be described before code analysis.',
        detail: sourceStructure.detail,
        file: sourceStructure.file,
        line: sourceStructure.line,
      }],
      openItems,
      stale,
      unregistered,
      traceSeeds: [],
      airLedger,
      metrics: {
        dsc: dscFiles.length,
        dsr: dsrFiles.length,
        airFiles: airFiles.length,
        airLines: airText.split('\n').filter(line => line.trim()).length,
        airDecisions: airLedger.decisions.length,
        airDsrRefs: airLedger.dsrRefCount,
        airGrooming: airLedger.grooming.length,
        openItems: openItems.length,
        unresolvedRefs: 0,
        codeLinkIssues: 0,
        unnormalized: 0,
        unregistered: 0,
        sourceStructureMissing: 1,
      },
    };
  }

  const unnormalized = collectUnnormalizedIntake(ws);
  const codeLinkIssues = collectCodeLinkIssues(ws, dsMapIndex);

  const senseErrors = [
    ...unresolvedRefs.map(ref => ({
      severity: 'error',
      title: `Unresolved reference ${ref.key}`,
      detail: `${relativePath(ws, ref.file)}:${ref.line + 1}`,
      file: ref.file,
      line: ref.line,
    })),
    ...unnormalized.map(item => ({
      severity: 'warning',
      title: `Unnormalized ${item.kind} intake`,
      detail: `${item.rel}:${item.line + 1} — ${item.text}`,
      file: item.file,
      line: item.line,
    })),
    ...codeLinkIssues.slice(0, 20).map(item => ({
      severity: 'warning',
      title: item.text,
      detail: `${item.rel}:${item.line + 1}`,
      file: path.join(ws, item.rel),
      line: item.line,
    })),
  ];

  const traceSeeds = requirements
    .slice(0, 12)
    .map(req => {
      const mapEntry = dsMapEntries.find(entry => entry.slug === req.key);
      const refsInCode = mapEntry ? findHashOccurrences(ws, mapEntry.hash).filter(occ => !relativePath(ws, occ.filePath).startsWith('ds/')) : [];
      const codeRefs = refsInCode
        .slice(0, 8)
        .map(occ => ({
          file: occ.filePath,
          rel: relativePath(ws, occ.filePath),
          line: occ.line,
          preview: previewForOccurrence(occ.filePath, occ),
        }));
      return { ...req, hash: mapEntry?.hash || '', codeCount: refsInCode.length, codeRefs };
    });

  return {
    summary,
    requirements,
    senseErrors,
    openItems,
    stale,
    unregistered,
    traceSeeds,
    airLedger,
    metrics: {
      dsc: dscFiles.length,
      dsr: dsrFiles.length,
      airFiles: airFiles.length,
      airLines: airText.split('\n').filter(line => line.trim()).length,
      airDecisions: airLedger.decisions.length,
      airDsrRefs: airLedger.dsrRefCount,
      airGrooming: airLedger.grooming.length,
      openItems: openItems.length,
      unresolvedRefs: unresolvedRefs.length,
      codeLinkIssues: codeLinkIssues.length,
      unnormalized: unnormalized.length,
      unregistered: unregistered.length,
      sourceStructureMissing: 0,
    },
  };
}

function pipelineStatus(data) {
  const blocking = [];
  const warnings = [];

  if (data.metrics.sourceStructureMissing) blocking.push('executable source boundary is missing');
  if (data.metrics.unresolvedRefs) blocking.push(`${data.metrics.unresolvedRefs} unresolved refs`);
  if (data.metrics.unnormalized) blocking.push(`${data.metrics.unnormalized} raw bug/fix intake`);
  if (data.metrics.codeLinkIssues) warnings.push(`${data.metrics.codeLinkIssues} code link issues`);
  if (data.metrics.openItems) warnings.push(`${data.metrics.openItems} open bug/fix/task items`);
  if (data.metrics.unregistered) warnings.push(`${data.metrics.unregistered} unregistered markers`);
  if (data.stale.length) warnings.push(`${data.stale.length} stale layer signals`);

  if (blocking.length) {
    if (data.metrics.sourceStructureMissing) {
      return {
        gate: 'DS / DS~',
        readiness: 'blocked',
        next: 'specify executable source boundary in ds.config.md or main.ds',
        detail: blocking.join('; '),
        command: 'domain-sense.openConfig',
        commandLabel: 'Open config',
      };
    }
    return {
      gate: 'FIX / REF',
      readiness: 'blocked',
      next: 'normalize intake and repair broken references',
      detail: blocking.join('; '),
      command: 'domain-sense.runFIX',
      commandLabel: 'Prepare FIX',
    };
  }

  if (!data.summary.hasDsc) {
    return {
      gate: 'DSC',
      readiness: 'needs coduction',
      next: 'compile DS/IA/FIX meaning into DSC',
      detail: 'No .dsc layer detected.',
      command: 'domain-sense.runDSC',
      commandLabel: 'Prepare DSC',
    };
  }

  if (data.stale.length) {
    return {
      gate: 'DSC / DSR',
      readiness: 'stale',
      next: 'refresh the first stale downstream layer',
      detail: data.stale[0],
      command: 'domain-sense.runDSC',
      commandLabel: 'Prepare DSC',
    };
  }

  if (!data.summary.hasDsr) {
    return {
      gate: 'DSR',
      readiness: 'needs rendition',
      next: 'compile DSC/AIR into implementation rules',
      detail: 'No .dsr layer detected.',
      command: 'domain-sense.runDSR',
      commandLabel: 'Prepare DSR',
    };
  }

  if (!data.summary.hasDsMap || warnings.length) {
    return {
      gate: 'REF',
      readiness: warnings.length ? 'needs audit' : 'needs index',
      next: 'verify trace links before implementation',
      detail: warnings[0] || '.dsmap is missing.',
      command: 'domain-sense.runREF',
      commandLabel: 'Prepare REF',
    };
  }

  return {
    gate: 'IMP',
    readiness: 'ready',
    next: 'implementation can use DSR as source of truth',
    detail: 'No local blockers detected by the panel index.',
    command: 'domain-sense.runIMP',
    commandLabel: 'Prepare IMP',
  };
}

function issueIcon(severity) {
  return severity === 'error' ? '!' : severity === 'warning' ? '?' : 'ok';
}

function renderOpenButton(filePath, line = 0, label = 'open') {
  if (!filePath) return '';
  return `<button class="link" data-open="${escapeHtml(filePath)}" data-line="${line}">${escapeHtml(label)}</button>`;
}

function renderPanelHtml(data, ws) {
  const pipeline = pipelineStatus(data);
  const canFixCodeLinks = data.metrics.codeLinkIssues > 0;
  const issueRows = data.senseErrors.length
    ? data.senseErrors.slice(0, 12).map(issue => `
      <li class="${issue.severity}">
        <span class="badge">${issueIcon(issue.severity)}</span>
        <div><strong>${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.detail)}</small></div>
        ${renderOpenButton(issue.file, issue.line)}
      </li>`).join('')
    : `<li class="ok"><span class="badge">ok</span><div><strong>No blocking sense errors detected locally.</strong><small>Run DS/DSC for semantic review.</small></div></li>`;

  const taskRows = data.openItems.length
    ? data.openItems.slice(0, 10).map(item => `
      <li>
        <span class="pill">${escapeHtml(item.kind)}</span>
        <div><strong>${escapeHtml(item.slug || item.text || 'open item')}</strong><small>${escapeHtml(item.rel)}:${item.line + 1}${item.slug ? ` — ${item.text}` : ''}</small></div>
        ${renderOpenButton(item.file, item.line)}
      </li>`).join('')
    : `<li><span class="pill">clear</span><div><strong>No open bug/fix/task items.</strong><small>Use intake below to capture new work.</small></div></li>`;

  const staleRows = data.stale.length
    ? data.stale.map(text => `<li><span class="badge">?</span><div><strong>${escapeHtml(text)}</strong></div></li>`).join('')
    : `<li class="ok"><span class="badge">ok</span><div><strong>No obvious stale layer found by timestamp.</strong></div></li>`;

  const traceRows = data.traceSeeds.map(seed => {
    const codeRefRows = seed.codeRefs.length
      ? seed.codeRefs.map(ref => `
        <li class="trace-child">
          <span class="tree-edge">↳</span>
          <div><strong>${escapeHtml(ref.rel)}:${ref.line + 1}</strong><small>${escapeHtml(ref.preview)}</small></div>
          ${renderOpenButton(ref.file, ref.line)}
        </li>`).join('')
      : `<li class="trace-child"><span class="tree-edge">↳</span><div><strong>No implementation references found.</strong><small>Hash is currently unmapped in code.</small></div></li>`;
    const overflow = seed.codeCount > seed.codeRefs.length
      ? `<li class="trace-child"><span class="tree-edge">+</span><div><strong>${seed.codeCount - seed.codeRefs.length} more code ref(s)</strong><small>Use REF search/hover for the full occurrence list.</small></div></li>`
      : '';

    return `
      <li class="trace-root">
        <details open>
          <summary>
            <span class="pill">${escapeHtml(seed.hash || 'unmapped')}</span>
            <div><strong>${escapeHtml(seed.key)}</strong><small>${escapeHtml(seed.rel)}:${seed.line + 1} → code refs: ${seed.codeCount}</small></div>
            ${renderOpenButton(seed.file, seed.line, 'decl')}
          </summary>
          <ul class="trace-children">
            <li class="trace-child">
              <span class="tree-edge">↳</span>
              <div><strong>declaration</strong><small>${escapeHtml(seed.rel)}:${seed.line + 1}</small></div>
              ${renderOpenButton(seed.file, seed.line)}
            </li>
            ${codeRefRows}
            ${overflow}
          </ul>
        </details>
      </li>`;
  }).join('');

  const unregisteredRows = data.unregistered.slice(0, 8).map(req => `
    <li class="warning">
      <span class="badge">?</span>
      <div><strong>${escapeHtml(req.key)}</strong><small>not registered in ds/.dsmap</small></div>
      ${renderOpenButton(req.file, req.line)}
    </li>`).join('');

  const airDecisionRows = data.airLedger.decisions.length
    ? data.airLedger.decisions.slice(0, 6).map(decision => `
      <li>
        <span class="pill">${escapeHtml(decision.confidence || 'no conf')}</span>
        <div><strong>${escapeHtml(decision.text)}</strong><small>${escapeHtml(decision.rel)}:${decision.line + 1}${decision.rationale ? ` - ${escapeHtml(decision.rationale)}` : ''}</small></div>
        ${renderOpenButton(decision.file, decision.line)}
      </li>`).join('')
    : `<li class="warning"><span class="badge">?</span><div><strong>No accepted interpretations found.</strong><small>AIR currently stores notes/metadata only.</small></div></li>`;

  const airCoverageRows = data.airLedger.files
    .slice()
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map(file => `
      <li class="${file.dsrRefs.length ? '' : 'warning'}">
        <span class="pill">${file.dsrRefs.length} dsr</span>
        <div><strong>${escapeHtml(file.rel)}</strong><small>${file.decisions.length} decision(s), ${file.notes.length} note(s), ${file.structured.length} metadata item(s)</small></div>
        ${renderOpenButton(file.file, 0)}
      </li>`).join('');

  const airGroomingRows = data.airLedger.grooming.length
    ? data.airLedger.grooming.slice(0, 8).map(item => `
      <li class="warning">
        <span class="badge">?</span>
        <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div>
        ${renderOpenButton(item.file, item.line)}
      </li>`).join('')
    : `<li class="ok"><span class="badge">ok</span><div><strong>No AIR grooming warnings from local structure.</strong><small>This does not replace semantic review.</small></div></li>`;

  const airSummary = [
    `${data.airLedger.confidenceCounts.high || 0} high-confidence`,
    `${data.airLedger.noteCount} rationale note(s)`,
    `${data.airLedger.questionCount} open question(s)`,
    `${data.airLedger.referencedFileCount}/${data.metrics.airFiles} files referenced by DSR`,
  ].join(' - ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 12px; }
    h2 { margin: 0 0 8px; font-size: 13px; letter-spacing: 0; }
    section { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 9px; margin-bottom: 10px; background: color-mix(in srgb, var(--vscode-editor-background), var(--vscode-sideBar-background) 25%); }
    .compact { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .metric { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; display: flex; justify-content: space-between; gap: 8px; }
    .pipeline-grid { display: grid; gap: 7px; }
    .pipeline-main { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; }
    .pipeline-main span { display: block; color: var(--vscode-descriptionForeground); margin-bottom: 3px; }
    .pipeline-main strong { font-size: 15px; }
    .pipeline-action { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .section-heading h2 { margin: 0; }
    .metric span, small { color: var(--vscode-descriptionForeground); }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    li { display: grid; grid-template-columns: auto 1fr auto; align-items: start; gap: 8px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border), transparent 45%); padding-bottom: 6px; }
    li:last-child { border-bottom: 0; padding-bottom: 0; }
    .trace-root { display: block; }
    .trace-root details { width: 100%; }
    .trace-root summary { display: grid; grid-template-columns: 14px auto 1fr auto; align-items: start; gap: 8px; cursor: pointer; list-style: none; }
    .trace-root summary::-webkit-details-marker { display: none; }
    .trace-root summary::before { content: '▾'; color: var(--vscode-descriptionForeground); align-self: center; grid-column: 1; }
    .trace-root details:not([open]) summary::before { content: '▸'; }
    .trace-root summary .pill { grid-column: 2; grid-row: 1; justify-self: start; }
    .trace-root summary div { grid-column: 3; grid-row: 1; }
    .trace-root summary button { grid-column: 4; grid-row: 1; }
    .trace-children { margin: 7px 0 0 18px; gap: 5px; }
    .trace-child { grid-template-columns: 18px 1fr auto; border-bottom: 0; padding-bottom: 0; }
    .tree-edge { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 20px; text-align: center; }
    .subsection { margin-top: 8px; }
    .subsection h3 { margin: 0 0 6px; font-size: 12px; color: var(--vscode-descriptionForeground); font-weight: 650; }
    strong { display: block; font-weight: 650; }
    .badge, .pill { min-width: 20px; height: 20px; border-radius: 10px; display: inline-grid; place-items: center; font-size: 11px; padding: 0 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .pill { border-radius: 4px; width: auto; }
    .error .badge { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
    .warning .badge { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground); }
    .ok .badge { background: var(--vscode-terminal-ansiGreen); color: var(--vscode-editor-background); }
    button { cursor: pointer; border-radius: 4px; border: 1px solid var(--vscode-panel-border); color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); padding: 4px 7px; font-size: 11px; }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    textarea { width: 100%; min-height: 56px; resize: vertical; margin: 6px 0; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px; font-family: var(--vscode-font-family); box-sizing: border-box; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .muted { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <section>
    <h2>1. Pipeline</h2>
    <div class="pipeline-grid">
      <div class="compact">
        <div class="pipeline-main"><span>current gate</span><strong>${escapeHtml(pipeline.gate)}</strong></div>
        <div class="pipeline-main"><span>readiness</span><strong>${escapeHtml(pipeline.readiness)}</strong></div>
      </div>
      <div class="pipeline-main pipeline-action">
        <div><span>next action</span><strong>${escapeHtml(pipeline.next)}</strong><small>${escapeHtml(pipeline.detail)}</small></div>
        <button data-command="${escapeHtml(pipeline.command)}">${escapeHtml(pipeline.commandLabel)}</button>
      </div>
      <div class="pipeline-main pipeline-action">
        <div>
          <span>contract</span>
          <strong>${escapeHtml(data.summary.setup?.contract.ref || 'unknown')}</strong>
          <small>${escapeHtml(data.summary.setup?.contract.detail || '')}${data.summary.setup?.contract.exists ? '' : ' - missing'}</small>
        </div>
        <button data-command="domain-sense.openContract">Open contract</button>
      </div>
      <div class="pipeline-main pipeline-action">
        <div>
          <span>config</span>
          <strong>${escapeHtml(data.summary.setup?.config.ref || 'ds.config.md')}</strong>
          <small>${escapeHtml(data.summary.setup?.config.detail || '')}${data.summary.setup?.config.exists ? '' : ' - missing'}</small>
        </div>
        <button data-command="domain-sense.openConfig">Open config</button>
      </div>
      <div class="pipeline-main pipeline-action">
        <div>
          <span>agent connector</span>
          <strong>AGENTS.md</strong>
          <small>Create or update DS contract/config declarations.</small>
        </div>
        <button data-command="domain-sense.generateAgents">Update AGENTS.md</button>
      </div>
      <small>Index only: ${data.summary.requirementCount} markers, ${data.summary.linkedCount} .dsmap links. Counts are not readiness criteria.</small>
    </div>
  </section>

  <section>
    <div class="section-heading">
      <h2>2. Sense Errors</h2>
      ${canFixCodeLinks ? '<button data-command="domain-sense.fixCodeLinks">Try to fix it all</button>' : ''}
    </div>
    <ul>${issueRows}</ul>
  </section>

  <section>
    <h2>3. Bug/Fix Tracker</h2>
    <ul>${taskRows}</ul>
    <textarea id="intake" placeholder="Write bug, fix, or task intake..."></textarea>
    <div class="actions">
      <button data-intake="bug">Add bug</button>
      <button data-intake="fix">Add fix</button>
      <button data-intake="task">Add task</button>
    </div>
  </section>

  <section>
    <h2>4. IA Inbox</h2>
    <ul>
      <li><span class="pill">proposal</span><div><strong>Use this as a pre-file-change queue.</strong><small>Current implementation stores accepted text through intake; agent grooming still happens through DS/FIX.</small></div></li>
    </ul>
  </section>

  <section>
    <h2>5. Command Assistant</h2>
    <div class="actions">
      <button data-command="domain-sense.generateAgents">AGENTS</button>
      <button data-command="domain-sense.runDS">DS</button>
      <button data-command="domain-sense.runDSC">DSC</button>
      <button data-command="domain-sense.runDSR">DSR</button>
      <button data-command="domain-sense.runFIX">FIX</button>
      <button data-command="domain-sense.runREF">REF</button>
    </div>
    <p class="muted">Recommended model: strong reasoning for DS/DSC/FIX root cause; coding model is acceptable for IMP when DSR is precise.</p>
  </section>

  <section>
    <h2>6. Trace Tree</h2>
    <ul>${traceRows || '<li><span class="pill">empty</span><div><strong>No trace seeds found.</strong></div></li>'}</ul>
  </section>

  <section>
    <h2>7. Requirement Web</h2>
    <ul><li><span class="pill">index</span><div><strong>.dsweb not implemented yet.</strong><small>Current local graph uses inline @refs and .dsmap links.</small></div></li></ul>
  </section>

  <section>
    <h2>8. Consistency Monitor</h2>
    <ul>${staleRows}${unregisteredRows}</ul>
  </section>

  <section>
    <h2>9. AIR Ledger</h2>
    <div class="compact">
      <div class="metric"><span>AIR files</span><strong>${data.metrics.airFiles}</strong></div>
      <div class="metric"><span>decisions</span><strong>${data.metrics.airDecisions}</strong></div>
      <div class="metric"><span>DSR refs</span><strong>${data.metrics.airDsrRefs}</strong></div>
      <div class="metric"><span>grooming</span><strong>${data.metrics.airGrooming}</strong></div>
    </div>
    <p class="muted">${escapeHtml(airSummary)}</p>
    <div class="subsection">
      <h3>Accepted decisions</h3>
      <ul>${airDecisionRows}</ul>
    </div>
    <div class="subsection">
      <h3>DSR coverage</h3>
      <ul>${airCoverageRows || '<li><span class="pill">empty</span><div><strong>No AIR files found.</strong></div></li>'}</ul>
    </div>
    <div class="subsection">
      <h3>Grooming queue</h3>
      <ul>${airGroomingRows}</ul>
    </div>
  </section>

  <section>
    <h2>10. Scenario Matrix</h2>
    <ul><li><span class="pill">matrix</span><div><strong>Scenario probes are not generated yet.</strong><small>This section is reserved for requirement → scenario → verification coverage.</small></div></li></ul>
  </section>

  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach(button => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
    });
    document.querySelectorAll('[data-open]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        vscode.postMessage({ command: 'open', file: button.dataset.open, line: Number(button.dataset.line || 0) });
      });
    });
    document.querySelectorAll('[data-intake]').forEach(button => {
      button.addEventListener('click', () => {
        const textarea = document.getElementById('intake');
        vscode.postMessage({ command: 'intake', type: button.dataset.intake, text: textarea.value });
        textarea.value = '';
      });
    });
  </script>
</body>
</html>`;
}

class RequirementsProvider {
  constructor(ws, getKeyMap) {
    this.ws = ws;
    this.getKeyMap = getKeyMap;
    this.onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  }

  refresh() {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(item) {
    return item;
  }

  getChildren(item) {
    const keyMap = this.getKeyMap();
    if (!item) {
      const groups = REFERENCE_KINDS
        .map(kind => {
          const count = Object.keys(keyMap).filter(key => key.startsWith(`${kind}:`)).length;
          const treeItem = new vscode.TreeItem(`${kind} (${count})`, count ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
          treeItem.contextValue = 'domainSenseRequirementGroup';
          treeItem.iconPath = new vscode.ThemeIcon('symbol-namespace');
          treeItem.dsKind = kind;
          return treeItem;
        });
      return groups;
    }

    if (!item.dsKind) return [];
    return Object.entries(keyMap)
      .filter(([key]) => key.startsWith(`${item.dsKind}:`))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => {
        const treeItem = new vscode.TreeItem(key, vscode.TreeItemCollapsibleState.None);
        treeItem.description = path.relative(this.ws, entry.file).replace(/\\/g, '/');
        treeItem.tooltip = `${key}\n${treeItem.description}:${entry.line + 1}`;
        treeItem.iconPath = new vscode.ThemeIcon('symbol-key');
        treeItem.command = {
          command: 'vscode.open',
          title: 'Open Requirement',
          arguments: [
            vscode.Uri.file(entry.file),
            { selection: new vscode.Range(entry.line, 0, entry.line, 0) }
          ]
        };
        return treeItem;
      });
  }
}

class StageViewProvider {
  constructor(getSummary) {
    this.getSummary = getSummary;
    this.view = undefined;
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.html = renderStageHtml(this.getSummary());
  }

  refresh() {
    if (this.view) this.view.webview.html = renderStageHtml(this.getSummary());
  }
}

class ActionsViewProvider {
  resolveWebviewView(view) {
    view.webview.options = { enableScripts: true };
    view.webview.html = renderActionsHtml();
    view.webview.onDidReceiveMessage((message) => {
      if (message?.command) vscode.commands.executeCommand(message.command);
    });
  }
}

class DomainPanelProvider {
  constructor(ws, getData) {
    this.ws = ws;
    this.getData = getData;
    this.view = undefined;
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = renderPanelHtml(this.getData(), this.ws);
    view.webview.onDidReceiveMessage((message) => {
      if (message?.command === 'open' && message.file) {
        const line = Number.isFinite(message.line) ? message.line : 0;
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.file), {
          selection: new vscode.Range(line, 0, line, 0),
        });
        return;
      }

      if (message?.command === 'intake') {
        writePanelIntake(this.ws, message.type, message.text);
        vscode.window.showInformationMessage(`Domain Sense ${message.type || 'task'} intake captured.`);
        this.refresh();
        return;
      }

      if (message?.command) vscode.commands.executeCommand(message.command);
    });
  }

  refresh() {
    if (this.view) this.view.webview.html = renderPanelHtml(this.getData(), this.ws);
  }
}

function activate(context) {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) return;

  let dsMapFiles = loadDsMapFiles(ws);
  let refMap = loadRefMap(ws, dsMapFiles.byHash);
  let keyMap = loadKeyMap(ws);
  let dsMapEntries = loadDsMapEntries(ws, dsMapFiles.byHash);
  let dsMapIndex = buildDsMapIndex(dsMapEntries);
  let airMap = loadAirMap(ws);
  let completionIndex = buildCompletionIndex(ws, dsMapEntries);
  let setup = resolveDomainSenseSetup(ws, context.extensionPath);
  writeResolvedContractArtifact(ws, setup, context);
  const refreshListeners = [];

  function refreshIndexes() {
    dsMapFiles = loadDsMapFiles(ws);
    refMap = loadRefMap(ws, dsMapFiles.byHash);
    keyMap = loadKeyMap(ws);
    dsMapEntries = loadDsMapEntries(ws, dsMapFiles.byHash);
    dsMapIndex = buildDsMapIndex(dsMapEntries);
    airMap = loadAirMap(ws);
    completionIndex = buildCompletionIndex(ws, dsMapEntries);
    setup = resolveDomainSenseSetup(ws, context.extensionPath);
    writeResolvedContractArtifact(ws, setup, context);
    for (const listener of refreshListeners) listener();
  }

  function triggerSenseSuggest(editor) {
    if (!editor || !isSenseDocument(editor.document)) return;
    const position = editor.selection.active;
    const linePrefix = editor.document.lineAt(position.line).text.slice(0, position.character);
    if (new RegExp(`@(?:${KIND_PATTERN}):$`).test(linePrefix) || new RegExp(`^\\s*\\[(?:${KIND_PATTERN}):$`).test(linePrefix)) {
      setTimeout(() => vscode.commands.executeCommand('editor.action.triggerSuggest'), 25);
    }
  }

  function watch(relativePattern) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(ws, relativePattern));
    watcher.onDidChange(refreshIndexes);
    watcher.onDidCreate(refreshIndexes);
    watcher.onDidDelete(refreshIndexes);
    context.subscriptions.push(watcher);
  }

  watch('ds/.dsmap');
  watch('ds/ref');
  watch('ds/**/*.ds');
  watch('ds/**/*.ia');
  watch('ds/**/*.air');
  watch('ds/**/*.dsc');
  watch('ds/**/*.dsr');
  watch('ds/**/*.fix');
  watch('AGENTS.md');
  watch('ds.config.md');

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== event.document.uri.toString()) return;
      triggerSenseSuggest(editor);
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      triggerSenseSuggest(event.textEditor);
    })
  );

  function getStageSummary() {
    return summarizeDomainSenseStage(ws, keyMap, dsMapEntries, setup);
  }

  function getPanelData() {
    return loadPanelData(ws, getStageSummary(), keyMap, dsMapEntries, dsMapIndex);
  }

  const requirementsProvider = new RequirementsProvider(ws, () => keyMap);
  const domainPanelProvider = new DomainPanelProvider(ws, getPanelData);
  const stageViewProvider = new StageViewProvider(getStageSummary);
  const actionsViewProvider = new ActionsViewProvider();

  refreshListeners.push(
    () => requirementsProvider.refresh(),
    () => domainPanelProvider.refresh(),
    () => stageViewProvider.refresh()
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('domain-sense.requirements', requirementsProvider),
    vscode.window.registerWebviewViewProvider('domain-sense.panel', domainPanelProvider),
    vscode.window.registerWebviewViewProvider('domain-sense.stage', stageViewProvider),
    vscode.window.registerWebviewViewProvider('domain-sense.actions', actionsViewProvider)
  );

  function openWorkspaceFile(relativePath) {
    const filePath = path.join(ws, relativePath);
    if (!fs.existsSync(filePath)) {
      vscode.window.showWarningMessage(`${relativePath} does not exist.`);
      return;
    }
    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
  }

  function openResolvedFile(filePath, label) {
    if (!filePath || !fs.existsSync(filePath)) {
      vscode.window.showWarningMessage(`${label} does not exist.`);
      return;
    }
    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
  }

  function registerPrepareCommand(commandId, label, prompt) {
    return vscode.commands.registerCommand(commandId, async () => {
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage(`${label} command copied to clipboard.`);
    });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('domain-sense.refresh', () => refreshIndexes()),
    vscode.commands.registerCommand('domain-sense.openMainSense', () => openWorkspaceFile('ds/sense/main.ds')),
    vscode.commands.registerCommand('domain-sense.openDsMap', () => openWorkspaceFile('ds/.dsmap')),
    vscode.commands.registerCommand('domain-sense.openContract', () => openResolvedFile(setup.contract.file, setup.contract.ref)),
    vscode.commands.registerCommand('domain-sense.openConfig', () => openResolvedFile(setup.config.file, setup.config.ref)),
    vscode.commands.registerCommand('domain-sense.generateAgents', () => {
      const result = ensureAgentsContract(ws);
      refreshIndexes();
      openResolvedFile(result.file, 'AGENTS.md');
      vscode.window.showInformationMessage(result.changed ? 'AGENTS.md updated for Domain Sense.' : 'AGENTS.md already contains Domain Sense declarations.');
    }),
    vscode.commands.registerCommand('domain-sense.fixCodeLinks', () => {
      const result = fixCodeLinkIssues(ws, dsMapIndex);
      refreshIndexes();
      vscode.window.showInformationMessage(`Domain Sense fixed ${result.changedRefs} code link(s) in ${result.changedFiles} file(s).`);
    }),
    registerPrepareCommand('domain-sense.runDS', 'DS', 'DS'),
    registerPrepareCommand('domain-sense.runDSC', 'DSC', 'DSC'),
    registerPrepareCommand('domain-sense.runDSR', 'DSR', 'DSR'),
    registerPrepareCommand('domain-sense.runIMP', 'IMP', 'IMP'),
    registerPrepareCommand('domain-sense.runFIX', 'FIX', 'FIX'),
    registerPrepareCommand('domain-sense.runREF', 'REF', 'REF')
  );

  const provider = vscode.languages.registerDocumentLinkProvider({ scheme: 'file' }, {
    provideDocumentLinks(doc) {
      const links = [];
      const text = doc.getText();
      if (isDsMapDoc(doc)) {
        for (const entry of dsMapFiles.entries) {
          links.push(...fileLinksForIndexEntry(doc, entry));
        }
        for (const entry of dsMapEntries) {
          links.push(new vscode.DocumentLink(
            slugRangeForEntry(doc, entry),
            declarationUriFor(entry, airMap)
          ));
          links.push(...fileLinksForEntry(doc, entry));
        }
      }
      for (const ref of findRefs(text)) {
        const entry = refMap[ref.hash];
        if (!entry) continue;
        const start = doc.positionAt(ref.hashStart);
        const end = doc.positionAt(ref.hashEnd);
        links.push(new vscode.DocumentLink(
          new vscode.Range(start, end),
          vscode.Uri.file(entry.file)
        ));
      }
      for (const ref of findKeyRefs(text)) {
        const entry = keyMap[ref.key];
        if (!entry) continue;
        const start = doc.positionAt(ref.keyStart);
        const end = doc.positionAt(ref.keyEnd);
        links.push(new vscode.DocumentLink(
          new vscode.Range(start, end),
          vscode.Uri.file(entry.file).with({ fragment: `L${entry.line + 1}` })
        ));
      }
      return links;
    }
  });

  context.subscriptions.push(provider);

  const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
    provideHover(doc, position) {
      const line = doc.lineAt(position.line).text;
      if (isDsMapDoc(doc)) {
        for (const entry of dsMapFiles.entries) {
          if (position.line !== entry.line) continue;
          if (position.character >= entry.pathStart && position.character <= entry.pathEnd) {
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`[${escapeMarkdown(entry.pathText)}](${vscode.Uri.file(entry.file).toString()})`);
            return new vscode.Hover(md);
          }
          if (position.character >= entry.hashStart && position.character <= entry.hashEnd) {
            return new vscode.Hover(renderFileHashDetails(entry, dsMapEntries, airMap));
          }
        }
        for (const entry of dsMapEntries) {
          if (position.line !== entry.line) continue;
          if (position.character >= entry.slugStart && position.character <= entry.slugEnd) {
            const airEntry = airMap[entry.slug];
            if (airEntry) return new vscode.Hover(renderAirDetails(airEntry, keyMap));
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`**${entry.slug}**\n\n`);
            const desc = getDescription(entry.file, entry.slug);
            if (desc) md.appendMarkdown(renderWithLinks(desc, keyMap));
            return new vscode.Hover(md);
          }

          if (position.character >= entry.hashStart && position.character <= entry.hashEnd) {
            return new vscode.Hover(renderHashOccurrences(entry, ws));
          }

          if (position.character >= entry.fileRefStart && position.character <= entry.fileRefEnd) {
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            const label = entry.fileRefIsHash ? path.relative(ws, entry.file).replace(/\\/g, '/') : entry.fileRefText;
            md.appendMarkdown(`[${escapeMarkdown(label)}](${vscode.Uri.file(entry.file).toString()})`);
            return new vscode.Hover(md);
          }
        }
      }
      for (const ref of findRefs(line)) {
        if (position.character >= ref.hashStart && position.character <= ref.hashEnd) {
          const entry = refMap[ref.hash];
          if (!entry) return;
          const fullKey = `${entry.type}:${entry.name}`;
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          md.appendMarkdown(`**${fullKey}**\n\n`);
          const desc = getDescription(entry.file, fullKey);
          if (desc) md.appendMarkdown(renderWithLinks(desc, keyMap));
          return new vscode.Hover(md);
        }
      }
      for (const ref of findKeyRefs(line)) {
        if (position.character >= ref.keyStart && position.character <= ref.keyEnd) {
          const entry = keyMap[ref.key];
          if (!entry) return;
          const desc = getDescription(entry.file, ref.key);
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          md.appendMarkdown(`**${ref.key}**\n\n`);
          if (desc) md.appendMarkdown(renderWithLinks(desc, keyMap));
          return new vscode.Hover(md);
        }
      }
    }
  });

  context.subscriptions.push(hoverProvider);

  const definitionProvider = vscode.languages.registerDefinitionProvider({ scheme: 'file' }, {
    provideDefinition(doc, position) {
      const line = doc.lineAt(position.line).text;
      if (isDsMapDoc(doc)) {
        for (const entry of dsMapFiles.entries) {
          if (position.line !== entry.line) continue;
          if (position.character >= entry.pathStart && position.character <= entry.pathEnd) {
            return new vscode.Location(vscode.Uri.file(entry.file), new vscode.Position(0, 0));
          }
        }
        for (const entry of dsMapEntries) {
          if (position.line !== entry.line) continue;
          if (position.character >= entry.slugStart && position.character <= entry.slugEnd) {
            return declarationLocationFor(entry, airMap);
          }
          if (position.character >= entry.fileRefStart && position.character <= entry.fileRefEnd) {
            return new vscode.Location(vscode.Uri.file(entry.file), new vscode.Position(0, 0));
          }
        }
      }
      for (const ref of findRefs(line)) {
        if (position.character >= ref.hashStart && position.character <= ref.hashEnd) {
          const entry = refMap[ref.hash];
          return entry ? locationFor(entry) : undefined;
        }
      }
      for (const ref of findKeyRefs(line)) {
        if (position.character >= ref.keyStart && position.character <= ref.keyEnd) {
          const entry = keyMap[ref.key];
          return entry ? locationFor(entry) : undefined;
        }
      }
    }
  });

  context.subscriptions.push(definitionProvider);

  const completionProvider = vscode.languages.registerCompletionItemProvider([
    { language: 'domain-sense', scheme: 'file' },
    { language: 'markdown', scheme: 'file' },
    { language: 'yaml', scheme: 'file' },
  ], {
    provideCompletionItems(doc, position) {
      if (!isSenseDocument(doc)) return undefined;
      const linePrefix = doc.lineAt(position.line).text.slice(0, position.character);

      const refMatch = linePrefix.match(/@([a-z]*)(?::\s*([A-Za-z0-9_.-]*))?$/i);
      if (refMatch) {
        const fullMatch = refMatch[0];
        const kind = (refMatch[1] || '').toLowerCase();
        const namePrefix = refMatch[2] || '';
        const range = completionRangeFromMatch(position, fullMatch);

        if (!fullMatch.includes(':')) {
          return makeRefTypeItems(range);
        }

        if (REFERENCE_KINDS.includes(kind)) {
          const candidates = completionIndex[kind] || [];
          const slugRange = new vscode.Range(
            new vscode.Position(position.line, position.character - namePrefix.length),
            position
          );
          return makeSlugItems(kind, candidates, namePrefix, slugRange, keyMap);
        }
      }

      const markerMatch = linePrefix.match(/^\s*\[([a-z]*)(?::\s*([A-Za-z0-9_.-]*))?$/i);
      if (markerMatch) {
        const fullMatch = markerMatch[0];
        const kind = (markerMatch[1] || '').toLowerCase();
        const namePrefix = markerMatch[2] || '';
        const range = completionRangeFromMatch(position, fullMatch);

        if (!fullMatch.includes(':')) {
          return makeMarkerTypeItems(range);
        }

        if (MARKER_KINDS.includes(kind)) {
          const candidates = completionIndex[kind] || [];
          const slugRange = new vscode.Range(
            new vscode.Position(position.line, position.character - namePrefix.length),
            position
          );
          return makeSlugItems(kind, candidates, namePrefix, slugRange, keyMap);
        }
      }

      return undefined;
    }
  }, '@', ':', '[');

  context.subscriptions.push(completionProvider);

  const retriggerCommand = vscode.commands.registerCommand('domain-sense.triggerSuggestAfterInsert', () => {
    setTimeout(() => vscode.commands.executeCommand('editor.action.triggerSuggest'), 25);
  });

  context.subscriptions.push(retriggerCommand);
}

module.exports = { activate };

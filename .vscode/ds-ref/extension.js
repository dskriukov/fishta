const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const REFERENCE_KINDS = ['ds', 'ia', 'fn', 'it', 'do', 'eg'];
const IMPLEMENTATION_KINDS = ['fn', 'it', 'do', 'eg'];
const MARKER_KINDS = [...REFERENCE_KINDS, ...IMPLEMENTATION_KINDS];
const SENSE_FILE_EXTENSIONS = new Set(['.ds', '.ia', '.air', '.dsc']);
const INLINE_MARKER_RE = /\[(ds|ia|fn|it|do|eg):([A-Za-z0-9_.-]+)\]/;

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
  ]) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (let line = 0; line < lines.length; line++) {
      const m = lines[line].match(/\[(ds|ia|fn|it|do|eg):([^\]]+)\]/);
      if (m) map[`${m[1]}:${m[2]}`] = { type: m[1], name: m[2], file: filePath, line };
    }
  }
  return map;
}

function loadSenseSlugs(ws) {
  const byType = {
    ds: new Set(),
    ia: new Set(),
    fn: new Set(),
    it: new Set(),
    do: new Set(),
    eg: new Set(),
  };
  const senseDir = path.join(ws, 'ds', 'sense');
  const files = [
    ...listFiles(senseDir, '.ds'),
    ...listFiles(senseDir, '.ia'),
  ];
  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const marker = line.match(/\[(ds|ia|fn|it|do|eg):([A-Za-z0-9_.-]+)\]/);
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
    const m = text.match(/^(ds|ia):([A-Za-z0-9_.-]+)\s+-\s+([0-9a-f]{8})\s+(\S+)$/);
    if (!m) continue;
    const slug = `${m[1]}:${m[2]}`;
    const hash = m[3];
    const fileRefText = m[4];
    const indexedFile = /^[0-9a-f]{8}$/.test(fileRefText) ? fileIndexByHash[fileRefText] : undefined;
    const file = indexedFile ? indexedFile.file : path.join(ws, fileRefText);
    const slugStart = text.indexOf(slug);
    const hashStart = text.indexOf(hash, slugStart + slug.length);
    const fileRefStart = text.indexOf(fileRefText, hashStart + hash.length);
    entries.push({
      type: m[1],
      name: m[2],
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
    const m = line.match(/^(ds|ia):(\S+)\s+-\s+([0-9a-f]+)\s+(\S+)/);
    if (!m) continue;
    const fileRef = m[4];
    const indexedFile = /^[0-9a-f]{8}$/.test(fileRef) ? fileIndexByHash[fileRef] : undefined;
    const file = indexedFile ? indexedFile.file : path.join(ws, fileRef);
    map[m[3]] = { type: m[1], name: m[2], file };
  }
  return map;
}

function findHashOccurrences(ws, hash) {
  const files = listAllFiles(ws);
  const occurrences = [];
  for (const filePath of files) {
    if (/node_modules|\.git/.test(filePath)) continue;
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let line = 0; line < lines.length; line++) {
      const lineText = lines[line];
      const annotationRe = /@(ds|ia)\b/g;
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

      const directRe = /\b(ds|ia):([0-9a-f]{8})\b/g;
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
  const tokenRe = /@(ds|ia|fn|it|do|eg)\b/g;
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
  const directRe = /(ds|ia|fn|it|do|eg):([0-9a-f]{8})/g;
  while ((m = directRe.exec(text)) !== null) {
    refs.push({ type: m[1], hash: m[2], hashStart: m.index + m[0].indexOf(m[2]), hashEnd: m.index + m[0].indexOf(m[2]) + 8 });
  }
  return refs;
}

function findKeyRefs(text) {
  const refs = [];
  const re = /@(ds|ia|fn|it|do|eg):([A-Za-z0-9_.-]+)/g;
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
  const re = /@(ds|ia|fn|it|do|eg):([A-Za-z0-9_.\-]+)/g;
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

  function refreshIndexes() {
    dsMapFiles = loadDsMapFiles(ws);
    refMap = loadRefMap(ws, dsMapFiles.byHash);
    keyMap = loadKeyMap(ws);
    dsMapEntries = loadDsMapEntries(ws, dsMapFiles.byHash);
    dsMapIndex = buildDsMapIndex(dsMapEntries);
    airMap = loadAirMap(ws);
    completionIndex = buildCompletionIndex(ws, dsMapEntries);
  }

  function triggerSenseSuggest(editor) {
    if (!editor || !isSenseDocument(editor.document)) return;
    const position = editor.selection.active;
    const linePrefix = editor.document.lineAt(position.line).text.slice(0, position.character);
    if (/@(?:ds|ia|fn|it|do|eg):$/.test(linePrefix) || /^\s*\[(?:ds|ia|fn|it|do|eg):$/.test(linePrefix)) {
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
            return new vscode.Hover(airEntry ? renderAirDetails(airEntry, keyMap) : new vscode.MarkdownString(`**${entry.slug}**`));
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
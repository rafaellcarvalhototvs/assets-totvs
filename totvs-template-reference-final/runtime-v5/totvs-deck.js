(() => {
  'use strict';

  const engineScript = document.currentScript;
  const app = document.getElementById('totvs-deck-app');
  const manifestNode = document.getElementById('totvs-deck-manifest');

  function fail(message, error) {
    console.error(message, error || '');
    if (!app) return;
    app.innerHTML = '';
    const panel = document.createElement('main');
    panel.className = 'totvs-load-error';
    const title = document.createElement('h1');
    title.textContent = 'A apresentação não pôde ser carregada';
    const copy = document.createElement('p');
    copy.textContent = message;
    const detail = document.createElement('p');
    detail.textContent = 'O renderizador não cria uma versão genérica quando o layout oficial está indisponível.';
    panel.append(title, copy, detail);
    app.append(panel);
  }

  function readManifest() {
    if (!manifestNode) throw new Error('Manifesto #totvs-deck-manifest ausente.');
    const data = JSON.parse(manifestNode.textContent || '{}');
    if (data.schema !== 'totvs-deck/v5') throw new Error('Schema do manifesto incompatível.');
    if (!Array.isArray(data.slides) || !data.slides.length) throw new Error('O manifesto não contém slides.');
    data.slides.forEach((slide, index) => {
      if (!/^TOTVS-\d{3}$/.test(slide?.layout || '')) {
        throw new Error(`Layout inválido no slide ${index + 1}.`);
      }
    });
    return data;
  }

  function shell(manifest) {
    const motion = ['none', 'source', 'cascade'].includes(manifest.motion) ? manifest.motion : 'none';
    const contrast = ['source', 'aa', 'high'].includes(manifest.contrast) ? manifest.contrast : 'aa';
    const label = manifest.title || 'Apresentação TOTVS';
    app.innerHTML = `
      <main id="deck-viewport">
        <deck-stage id="deck-stage" role="region" aria-label="${escapeAttribute(label)}" data-entrance="${motion}" data-contrast="${contrast}" data-reading-mode="${escapeAttribute(manifest.readingMode || 'sala')}"></deck-stage>
      </main>
      <nav id="deck-controls" aria-label="Controles da apresentação">
        <button id="deck-controls-toggle" type="button" aria-expanded="false" aria-controls="deck-controls-panel" aria-label="Mostrar controles" title="Mostrar controles">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 14 6-6 6 6"></path></svg>
        </button>
        <div id="deck-controls-panel" hidden>
          <button id="deck-previous" type="button">Anterior</button>
          <span id="deck-counter" role="status" aria-live="polite">0 / 0</span>
          <button id="deck-next" type="button">Próximo</button>
          <button id="deck-fullscreen" type="button">Tela cheia</button>
          <button id="deck-motion-restart" type="button" hidden>Reiniciar animação</button>
          <button id="deck-motion-next" type="button" hidden>Próxima etapa</button>
          <button id="deck-motion-toggle" type="button" aria-pressed="false" hidden>Desativar movimento</button>
          <span id="deck-motion-status" role="status" aria-live="polite" hidden></span>
          <button id="deck-spacing-toggle" type="button" aria-pressed="false">Mais espaçamento</button>
          <button id="deck-contrast-toggle" type="button" aria-pressed="false">Alto contraste</button>
          <span id="deck-reading-status" role="status" aria-live="polite"></span>
          <button id="deck-edit" type="button" aria-pressed="false" aria-controls="deck-editor-panel">✏️ Editar slide</button>
          <button id="deck-download" type="button">Baixar HTML editado</button>
          <div id="deck-editor-panel" hidden>
            <p id="deck-editor-help">Edite os trechos abaixo. Pressione Enter para criar uma quebra de linha. As mudanças aparecem no slide. Textos maiores podem ultrapassar o espaço disponível; a tipografia e a estrutura são preservadas.</p>
            <div id="deck-editor-fields"></div>
          </div>
          <p id="deck-editor-status" role="status" aria-live="polite"></p>
        </div>
      </nav>
      <div id="totvs-animation-library" hidden></div>
      <dialog id="deck-link-dialog" aria-labelledby="deck-link-dialog-title">
        <header>
          <strong id="deck-link-dialog-title">Conteúdo vinculado</strong>
          <div>
            <a id="deck-link-external" href="#" target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
            <button id="deck-link-close" type="button" aria-label="Fechar conteúdo">Fechar</button>
          </div>
        </header>
        <iframe id="deck-link-frame" title="Conteúdo externo do slide" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
      </dialog>`;
  }

  function escapeAttribute(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function textNodes(element) {
    const nodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement?.closest('[data-fixed], [data-editable="false"], svg')) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.data.trim() || node.data.includes('\u00a0')
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function bindingRuns(value) {
    if (Array.isArray(value)) return value.map(item => String(item ?? ''));
    if (value && typeof value === 'object' && Array.isArray(value.runs)) {
      return value.runs.map(item => String(item ?? ''));
    }
    if (value && typeof value === 'object' && 'text' in value) return [String(value.text ?? '')];
    if (value === null || value === undefined) return null;
    return [String(value)];
  }

  function bySlot(section, attribute, id) {
    return Array.from(section.querySelectorAll(`[${attribute}]`))
      .find(node => node.getAttribute(attribute) === id) || null;
  }

  function applyText(section, bindings) {
    if (!bindings || typeof bindings !== 'object') return;
    Object.entries(bindings).forEach(([slot, value]) => {
      const target = bySlot(section, 'data-slot-id', slot);
      if (!target) {
        console.warn(`Slot de texto ${slot} não existe em ${section.dataset.templateId}.`);
        return;
      }
      if (target.matches('[data-fixed], [data-institutional="true"]')) {
        console.warn(`Slot institucional fixo ignorado: ${section.dataset.templateId}/${slot}.`);
        return;
      }
      const runs = bindingRuns(value);
      if (!runs) return;
      const nodes = textNodes(target);
      if (!nodes.length) return;
      nodes.forEach((node, index) => {
        const replacement = index < runs.length ? runs[index] : '';
        const prefix = node.data.match(/^[\t\n\f\r ]*/)?.[0] || '';
        const suffix = node.data.match(/[\t\n\f\r ]*$/)?.[0] || '';
        node.data = prefix + (replacement.trim() ? replacement : '\u00a0') + suffix;
      });
      if (runs.length > nodes.length) {
        const extras = runs.slice(nodes.length).filter(Boolean);
        if (extras.length) nodes[nodes.length - 1].data += `\n${extras.join('\n')}`;
      }
      target.toggleAttribute('data-editor-linebreak', runs.some(run => run.includes('\n')));
    });
  }

  function applyTextBoxes(section, boxes) {
    if (!boxes || typeof boxes !== 'object') return;
    const limits = { left: 1280, top: 720, width: 1280, height: 720 };
    Object.entries(boxes).forEach(([slot, box]) => {
      const target = bySlot(section, 'data-slot-id', slot);
      if (!target || !box || typeof box !== 'object') return;
      Object.entries(limits).forEach(([property, maximum]) => {
        if (target.dataset.boxResize === 'height-only' && property === 'width') return;
        const value = Number(box[property]);
        if (!Number.isFinite(value) || value < 0 || value > maximum) return;
        target.style[property] = `${value}px`;
      });
      target.dataset.textBoxAdjusted = 'true';
    });
  }

  function expandHeightOnlyStacks(section) {
    const groups = new Map();
    section.querySelectorAll('[data-box-resize="height-only"][data-box-stack]').forEach(node => {
      const key = node.dataset.boxStack;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    });
    const handled = new Set();
    groups.forEach(nodes => {
      nodes.sort((left, right) =>
        Number(left.dataset.boxStackOrder || 0) - Number(right.dataset.boxStackOrder || 0));
      const sectionWidth = section.clientWidth || 1280;
      const sectionHeight = section.clientHeight || 720;
      const metrics = nodes.map(node => {
        if (!node.dataset.boxBaseTopRatio) node.dataset.boxBaseTopRatio = String(node.offsetTop / sectionHeight);
        if (!node.dataset.boxBaseHeightRatio) node.dataset.boxBaseHeightRatio = String(node.offsetHeight / sectionHeight);
        if (!node.dataset.boxBaseWidthRatio) node.dataset.boxBaseWidthRatio = String(node.offsetWidth / sectionWidth);
        return {
          top: Number(node.dataset.boxBaseTopRatio) * sectionHeight,
          height: Number(node.dataset.boxBaseHeightRatio) * sectionHeight,
          width: Number(node.dataset.boxBaseWidthRatio) * sectionWidth,
        };
      });
      let cursor = metrics[0]?.top || 0;
      let previousBottom = cursor;
      nodes.forEach((node, index) => {
        const metric = metrics[index];
        const previous = metrics[index - 1];
        const gap = index === 0 ? 0 : Math.max(8, metric.top - (previous.top + previous.height));
        if (index > 0) cursor = previousBottom + gap;
        node.style.top = `${Math.round(cursor)}px`;
        node.style.width = `${Math.round(metric.width)}px`;
        node.style.height = `${Math.round(metric.height)}px`;
        const desiredHeight = Math.ceil(Math.max(metric.height, node.scrollHeight + 2));
        node.style.height = `${desiredHeight}px`;
        previousBottom = cursor + desiredHeight;
        handled.add(node);
      });
      const outsideCanvas = previousBottom > sectionHeight - 8;
      nodes.forEach(node => {
        const unresolved = outsideCanvas ||
          node.scrollWidth > node.clientWidth + 1 ||
          node.scrollHeight > node.clientHeight + 1;
        node.toggleAttribute('data-text-overflow', unresolved);
        node.toggleAttribute('data-text-box-expanded', !unresolved);
        if (unresolved) {
          console.warn(`Texto acima da capacidade em ${section.dataset.templateId}/${node.dataset.slotId}.`);
        }
      });
    });
    return handled;
  }

  function expandTextBoxes(section, policy) {
    if (policy !== 'expand') return;
    const heightOnly = expandHeightOnlyStacks(section);
    section.querySelectorAll('[data-slot-id]').forEach(target => {
      if (heightOnly.has(target)) return;
      const text = (target.textContent || '').trim();
      if (!text) return;
      const role = target.dataset.slotRole || '';
      const heightOverflow = target.scrollHeight > target.clientHeight + 1;
      const widthOverflow = target.scrollWidth > target.clientWidth + 1;
      if (!heightOverflow && !widthOverflow) return;

      const left = target.offsetLeft;
      const top = target.offsetTop;
      const baseWidth = target.clientWidth;
      const baseHeight = target.clientHeight;
      const smallOverflow = !widthOverflow && target.scrollHeight <= baseHeight * 1.18;
      if (smallOverflow) {
        target.dataset.textBoxExpanded = 'true';
        return;
      }

      const obstacles = Array.from(section.querySelectorAll(':scope > .slide-object'))
        .filter(node => {
          if (node === target) return false;
          if (node.matches('[data-slot-id], [data-table-slot], .object-image-frame')) return true;
          if (!node.matches('.object-image, .object-cover')) return false;
          return node.offsetWidth * node.offsetHeight < 1280 * 720 * 0.55;
        })
        .map(node => ({
          left: node.offsetLeft,
          top: node.offsetTop,
          right: node.offsetLeft + node.offsetWidth,
          bottom: node.offsetTop + node.offsetHeight,
        }));
      const overlap = (a1, a2, b1, b2) => Math.min(a2, b2) > Math.max(a1, b1) + 2;
      const maxWidth = obstacles.reduce((limit, item) => {
        if (item.left < left + baseWidth - 1) return limit;
        if (!overlap(top, top + baseHeight, item.top, item.bottom)) return limit;
        return Math.min(limit, item.left - left - 8);
      }, 1280 - left - 8);

      if (heightOverflow) {
        const factor = role === 'title' ? 1.45
          : (['label', 'contact'].includes(role) ? 2.5
          : (role === 'metric' ? 1.5
          : (role === 'supporting_text' ? 1.2 : 1.5)));
        const desired = Math.min(maxWidth, Math.ceil(baseWidth * factor));
        if (desired > baseWidth) target.style.width = `${desired}px`;
      }

      if (target.scrollWidth > target.clientWidth + 1 && maxWidth > target.clientWidth) {
        target.style.width = `${Math.min(maxWidth, target.scrollWidth + 4)}px`;
      }

      if (target.scrollHeight > target.clientHeight + 1) {
        const currentWidth = target.clientWidth;
        const maxHeight = obstacles.reduce((limit, item) => {
          if (item.top < top + baseHeight - 1) return limit;
          if (!overlap(left, left + currentWidth, item.left, item.right)) return limit;
          return Math.min(limit, item.top - top - 8);
        }, 720 - top - 8);
        const desired = Math.min(maxHeight, target.scrollHeight + 4);
        if (desired > baseHeight) target.style.height = `${desired}px`;
      }

      const unresolved = target.scrollWidth > target.clientWidth + 1 ||
        target.scrollHeight > target.clientHeight + 1;
      target.toggleAttribute('data-text-overflow', unresolved);
      target.toggleAttribute('data-text-box-expanded', !unresolved);
      if (unresolved) {
        console.warn(`Texto acima da capacidade em ${section.dataset.templateId}/${target.dataset.slotId}.`);
      }
    });
  }

  function allowedImageURL(value) {
    if (typeof value !== 'string') return false;
    return value.startsWith('data:image/') ||
      /^https:\/\/raw\.githubusercontent\.com\/rafaellcarvalhototvs\/assets-totvs\/[0-9a-f]{40}\//.test(value);
  }

  function applyImages(section, images, alternatives) {
    if (!images || typeof images !== 'object') return;
    Object.entries(images).forEach(([slot, value]) => {
      const target = bySlot(section, 'data-media-slot', slot);
      if (!target || !allowedImageURL(value)) {
        console.warn(`Imagem recusada ou slot inexistente: ${slot}.`);
        return;
      }
      const image = target.matches('img') ? target : target.querySelector('img');
      if (!image) return;
      image.src = value;
      if (alternatives && typeof alternatives[slot] === 'string') image.alt = alternatives[slot];
    });
  }

  function normalizedLink(value) {
    const input = typeof value === 'string' ? { url: value } : value;
    if (!input || typeof input !== 'object' || typeof input.url !== 'string') return null;
    let url;
    try {
      url = new URL(input.url);
    } catch (_) {
      return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let source = url.href;
    let kind = 'website';
    let mediaId = '';
    if (host === 'youtu.be') {
      mediaId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      mediaId = url.searchParams.get('v') ||
        url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]+)/)?.[1] || '';
    }
    if (/^[A-Za-z0-9_-]{6,20}$/.test(mediaId)) {
      kind = 'youtube';
      source = `https://www.youtube-nocookie.com/embed/${mediaId}?autoplay=1&rel=0`;
    } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      mediaId = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1] || '';
      if (mediaId) {
        kind = 'vimeo';
        source = `https://player.vimeo.com/video/${mediaId}?autoplay=1`;
      }
    }
    return {
      url: url.href,
      source,
      kind,
      label: typeof input.label === 'string' && input.label.trim()
        ? input.label.trim() : (kind === 'website' ? 'Site vinculado' : 'Vídeo vinculado'),
    };
  }

  function openLinkDialog(link) {
    const dialog = document.getElementById('deck-link-dialog');
    const frame = document.getElementById('deck-link-frame');
    const title = document.getElementById('deck-link-dialog-title');
    const external = document.getElementById('deck-link-external');
    const close = document.getElementById('deck-link-close');
    if (!dialog || !frame || !title || !external || !close) return;
    title.textContent = link.label;
    external.href = link.url;
    frame.title = link.label;
    frame.src = link.source;
    if (!dialog.dataset.ready) {
      const closeDialog = () => {
        if (dialog.open) dialog.close();
        frame.removeAttribute('src');
      };
      close.addEventListener('click', closeDialog);
      dialog.addEventListener('click', event => {
        if (event.target === dialog) closeDialog();
      });
      dialog.addEventListener('close', () => frame.removeAttribute('src'));
      dialog.dataset.ready = 'true';
    }
    if (!dialog.open) dialog.showModal();
    close.focus();
  }

  function applyLinks(section, links) {
    if (!links || typeof links !== 'object') return;
    Object.entries(links).forEach(([slot, value]) => {
      const trigger = bySlot(section, 'data-link-slot', slot);
      const link = normalizedLink(value);
      if (!trigger || !link) {
        console.warn(`Link recusado ou slot inexistente: ${slot}.`);
        return;
      }
      trigger.hidden = false;
      trigger.setAttribute('aria-label', link.label);
      trigger.addEventListener('click', event => {
        event.stopPropagation();
        openLinkDialog(link);
      });
    });
  }

  function normalizedTableCell(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const raw = 'text' in value ? value.text : ('value' in value ? value.value : '');
      const emphasis = ['accent', 'total', 'muted'].includes(value.emphasis)
        ? value.emphasis : '';
      const align = ['left', 'center', 'right'].includes(value.align)
        ? value.align : '';
      return { text: String(raw ?? ''), emphasis, align };
    }
    return { text: String(value ?? ''), emphasis: '', align: '' };
  }

  function sourceTableHeaders(table) {
    const row = Array.from(table.rows || [])[0];
    if (!row) return [];
    return Array.from(row.cells || []).map(cell => normalizedTableCell(cell.textContent || ''));
  }

  function normalizedTablePayload(table, value) {
    let headers = [];
    let rows = [];
    let align = [];
    let columnWidths = [];
    let label = '';

    if (Array.isArray(value)) {
      const matrix = value.filter(Array.isArray);
      if (!matrix.length) return null;
      headers = matrix[0];
      rows = matrix.slice(1);
    } else if (value && typeof value === 'object') {
      const columns = Array.isArray(value.columns) ? value.columns : [];
      headers = Array.isArray(value.headers)
        ? value.headers
        : columns.map(column => column && typeof column === 'object'
          ? (column.label ?? column.key ?? '') : column);
      rows = Array.isArray(value.rows) ? value.rows : [];
      if (columns.length && rows.some(row => row && !Array.isArray(row) && typeof row === 'object')) {
        rows = rows.map(row => Array.isArray(row) ? row : columns.map(column => {
          const key = column && typeof column === 'object' ? column.key : column;
          return row?.[key] ?? '';
        }));
      }
      align = Array.isArray(value.align)
        ? value.align
        : columns.map(column => column && typeof column === 'object' ? column.align : '');
      columnWidths = Array.isArray(value.columnWidths) ? value.columnWidths : [];
      label = typeof value.label === 'string' ? value.label.trim() : '';
    } else {
      return null;
    }

    rows = rows.filter(Array.isArray);
    const columnCount = Math.max(
      headers.length,
      align.length,
      columnWidths.length,
      ...rows.map(row => row.length),
    );
    if (!columnCount) return null;

    if (!headers.length) headers = sourceTableHeaders(table);
    while (headers.length < columnCount) headers.push(`Coluna ${headers.length + 1}`);
    headers = headers.slice(0, columnCount).map(normalizedTableCell);
    rows = rows.map(row => {
      const normalized = row.slice(0, columnCount).map(normalizedTableCell);
      while (normalized.length < columnCount) normalized.push(normalizedTableCell(''));
      return normalized;
    });
    align = Array.from({ length: columnCount }, (_, index) =>
      ['left', 'center', 'right'].includes(align[index]) ? align[index] : '');

    return { headers, rows, align, columnWidths, columnCount, label };
  }

  function tablePrototype(table) {
    const rows = Array.from(table.rows || []);
    return {
      header: rows[0] ? Array.from(rows[0].cells || []) : [],
      body: rows.slice(1).map(row => Array.from(row.cells || [])),
    };
  }

  function mappedPrototype(cells, index, total) {
    if (!cells?.length) return null;
    if (index === 0) return cells[0];
    if (index === total - 1) return cells[cells.length - 1];
    if (total <= 1) return cells[0];
    const sourceIndex = Math.round(index / (total - 1) * (cells.length - 1));
    return cells[Math.max(0, Math.min(cells.length - 1, sourceIndex))];
  }

  function adaptiveTableCell(tagName, prototype, value, defaultAlign) {
    const cell = document.createElement(tagName);
    if (prototype) {
      cell.className = prototype.className;
      cell.style.cssText = prototype.style.cssText;
    }
    cell.removeAttribute('rowspan');
    cell.removeAttribute('colspan');
    cell.removeAttribute('contenteditable');
    cell.style.removeProperty('height');
    cell.textContent = value.text;
    if (tagName === 'th') cell.scope = 'col';
    const alignment = value.align || defaultAlign;
    if (alignment) cell.style.textAlign = alignment;
    if (value.emphasis) cell.dataset.cellEmphasis = value.emphasis;
    return cell;
  }

  function inferredColumnWidths(payload) {
    const requested = payload.columnWidths.map(Number);
    if (requested.length === payload.columnCount && requested.every(value => value > 0)) {
      const total = requested.reduce((sum, value) => sum + value, 0) || 1;
      return requested.map(value => value / total * 100);
    }
    const matrix = [payload.headers, ...payload.rows];
    const weights = Array.from({ length: payload.columnCount }, (_, columnIndex) => {
      const values = matrix.map(row => row[columnIndex]?.text || '');
      const longest = values.reduce((maximum, text) => Math.max(maximum, text.length), 0);
      const body = payload.rows.map(row => row[columnIndex]?.text || '').filter(Boolean);
      const numeric = body.length > 0 && body.every(text =>
        /^[-+]?\s*(?:R\$\s*)?[\d.,]+\s*(?:%|mi|bi|mil)?$/i.test(text));
      let weight = numeric ? 0.9 : Math.max(1, Math.min(4.2, Math.sqrt(Math.max(8, longest) / 8)));
      if (columnIndex === 0) weight = Math.max(weight, 1.25);
      if (longest > 42) weight *= 1.25;
      return weight;
    });
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    return weights.map(value => value / total * 100);
  }

  function applyTables(section, tables) {
    if (!tables || typeof tables !== 'object') return;
    Object.entries(tables).forEach(([slot, value]) => {
      const table = bySlot(section, 'data-table-slot', slot);
      if (!table) {
        console.warn(`Slot de tabela ${slot} não existe em ${section.dataset.templateId}.`);
        return;
      }
      const payload = normalizedTablePayload(table, value);
      if (!payload) return;
      const prototypes = tablePrototype(table);
      const widths = inferredColumnWidths(payload);
      const colgroup = document.createElement('colgroup');
      widths.forEach(width => {
        const column = document.createElement('col');
        column.style.width = `${width.toFixed(4)}%`;
        colgroup.append(column);
      });

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      payload.headers.forEach((value, columnIndex) => {
        const prototype = mappedPrototype(prototypes.header, columnIndex, payload.columnCount);
        headerRow.append(adaptiveTableCell(
          'th', prototype, value, payload.align[columnIndex] || 'left'));
      });
      thead.append(headerRow);

      const tbody = document.createElement('tbody');
      payload.rows.forEach((row, rowIndex) => {
        const tableRow = document.createElement('tr');
        const prototypeRow = prototypes.body.length
          ? prototypes.body[rowIndex % prototypes.body.length] : [];
        row.forEach((value, columnIndex) => {
          const prototype = mappedPrototype(prototypeRow, columnIndex, payload.columnCount);
          tableRow.append(adaptiveTableCell(
            'td', prototype, value, payload.align[columnIndex] ||
              (columnIndex > 1 ? 'center' : 'left')));
        });
        tbody.append(tableRow);
      });

      table.replaceChildren(colgroup, thead, tbody);
      table.hidden = false;
      table.classList.add('totvs-adaptive-table');
      table.dataset.tableRuntime = 'true';
      table.dataset.tableRows = String(payload.rows.length);
      table.dataset.tableColumns = String(payload.columnCount);
      table.dataset.tableDensity =
        table.dataset.tableVariant === 'compact-dark' && payload.rows.length >= 7
          ? 'dense'
          : 'regular';
      table.style.setProperty('--table-accent', table.dataset.tableAccent || '#00c9eb');
      table.style.setProperty('--table-accent-ink', table.dataset.tableAccentInk || '#002233');
      table.style.setProperty('--table-soft', table.dataset.tableSoft || '#dfe5e8');
      if (payload.label) table.setAttribute('aria-label', payload.label);
      const backdrop = bySlot(section, 'data-table-backdrop', slot);
      if (backdrop) backdrop.hidden = false;
    });
  }

  function fitAdaptiveTables(section) {
    section.querySelectorAll('table[data-table-runtime="true"]').forEach(table => {
      const safeLeft = Number(table.dataset.tableSafeLeft || table.offsetLeft || 0);
      const safeTop = Number(table.dataset.tableSafeTop || table.offsetTop || 0);
      const safeWidth = Number(table.dataset.tableSafeWidth || table.offsetWidth || 1280);
      const safeHeight = Number(table.dataset.tableSafeHeight || 720 - safeTop);
      const columns = Number(table.dataset.tableColumns || 0);
      const rows = Number(table.dataset.tableRows || 0);
      const maxColumns = Number(table.dataset.tableMaxColumns || Infinity);
      const maxRows = Number(table.dataset.tableMaxRows || Infinity);
      const averageLength = (table.textContent || '').length / Math.max(1, (rows + 1) * columns);
      let widthFactor = columns <= 2 ? 0.76 : (columns === 3 ? 0.86 : (columns === 4 ? 0.94 : 1));
      if (averageLength > 26 || table.dataset.tableVariant === 'editorial-light') widthFactor = 1;
      const width = Math.round(safeWidth * widthFactor);
      const left = Math.round(safeLeft + (safeWidth - width) / 2);
      const backdrop = bySlot(section, 'data-table-backdrop', table.dataset.tableSlot);

      if (backdrop) {
        const safeBottom = safeTop + safeHeight;
        section.querySelectorAll(':scope > .slide-object').forEach(node => {
          if (node === table || node === backdrop || node.classList.contains('system-background')) return;
          const centerY = node.offsetTop + node.offsetHeight / 2;
          if (centerY >= safeTop - 4 && centerY <= safeBottom + 4) {
            node.hidden = true;
            node.setAttribute('aria-hidden', 'true');
            node.dataset.tableSourceHidden = table.dataset.tableSlot;
          }
        });
      }

      table.style.left = `${left}px`;
      table.style.top = `${safeTop}px`;
      table.style.width = `${width}px`;
      table.style.height = 'auto';
      table.style.maxHeight = 'none';
      Array.from(table.rows || []).forEach(row => row.style.removeProperty('height'));

      const measuredHeight = Math.ceil(table.scrollHeight || table.offsetHeight);
      const remaining = Math.max(0, safeHeight - measuredHeight);
      const verticalShift = Math.min(42, Math.round(remaining * 0.24));
      table.style.top = `${Math.round(safeTop + verticalShift)}px`;
      const overCapacity = rows > maxRows || columns > maxColumns;
      const visualOverflow = measuredHeight > safeHeight + 1;
      table.toggleAttribute('data-table-overflow', overCapacity || visualOverflow);
      if (overCapacity || visualOverflow) {
        table.style.top = `${safeTop}px`;
        console.warn(
          `Tabela acima da capacidade em ${section.dataset.templateId}/${table.dataset.tableSlot}. ` +
          'Divida os dados em slides de continuação; a fonte não será reduzida.'
        );
      }
    });
  }

  function namespaceSVG(section, slideIndex) {
    const map = new Map();
    section.querySelectorAll('svg [id]').forEach(node => {
      const oldId = node.id;
      const newId = `s${slideIndex + 1}-${oldId}`;
      map.set(oldId, newId);
      node.id = newId;
    });
    if (!map.size) return;
    const attrs = ['fill', 'stroke', 'filter', 'clip-path', 'mask', 'href', 'xlink:href', 'aria-labelledby', 'aria-describedby'];
    section.querySelectorAll('svg *').forEach(node => {
      attrs.forEach(attribute => {
        const value = node.getAttribute(attribute);
        if (!value) return;
        let next = value;
        map.forEach((newId, oldId) => {
          next = next.replaceAll(`url(#${oldId})`, `url(#${newId})`)
            .replaceAll(`#${oldId}`, `#${newId}`)
            .split(/\s+/).map(token => token === oldId ? newId : token).join(' ');
        });
        if (next !== value) node.setAttribute(attribute, next);
      });
    });
  }

  async function fetchTemplate(root, layout) {
    const response = await fetch(`${root}${layout}.json`, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Falha ${response.status} ao carregar ${layout}.`);
    const data = await response.json();
    if (data.id !== layout || typeof data.section !== 'string') {
      throw new Error(`Template ${layout} inválido.`);
    }
    return data;
  }

  async function render(manifest) {
    const currentStage = app?.querySelector('deck-stage');
    const existingSlides = currentStage
      ? Array.from(currentStage.children).filter(node => node.tagName === 'SECTION') : [];
    if (existingSlides.length) return;

    shell(manifest);
    const stage = app.querySelector('deck-stage');
    const animationLibrary = app.querySelector('#totvs-animation-library');
    const configuredRoot = manifest.runtime?.templateRoot || engineScript?.dataset.templateRoot || '';
    const root = configuredRoot.endsWith('/') ? configuredRoot : `${configuredRoot}/`;
    if (!/^https:\/\//.test(root) && !root.startsWith('./') && !root.startsWith('../') && !root.startsWith('/')) {
      throw new Error('Raiz dos templates ausente ou inválida.');
    }

    const templates = await Promise.all(manifest.slides.map(slide => fetchTemplate(root, slide.layout)));
    templates.forEach((templateData, index) => {
      const slideData = manifest.slides[index];
      const holder = document.createElement('template');
      holder.innerHTML = templateData.section.trim();
      const section = holder.content.firstElementChild;
      if (!(section instanceof HTMLElement) || section.tagName !== 'SECTION') {
        throw new Error(`Section inválida em ${slideData.layout}.`);
      }
      section.classList.toggle('active', index === 0);
      section.dataset.deckSlide = String(index + 1);
      section.dataset.templateInstance = `${slideData.layout}-${index + 1}`;
      applyText(section, slideData.bindings);
      applyTextBoxes(section, slideData.boxes);
      applyImages(section, slideData.images, slideData.alt);
      applyLinks(section, slideData.links);
      applyTables(section, slideData.tables);
      namespaceSVG(section, index);
      stage.append(section);
      fitAdaptiveTables(section);
      expandTextBoxes(section, manifest.textFit || 'expand');

      if (manifest.motion === 'source' && templateData.animation) {
        const payload = document.createElement('script');
        payload.type = 'application/json';
        payload.dataset.slideAnimation = slideData.layout;
        payload.id = `animation-${slideData.layout}-${index + 1}`;
        payload.textContent = JSON.stringify(templateData.animation);
        animationLibrary.append(payload);
      }
    });
  }

  async function start() {
    if (!app) throw new Error('Contêiner #totvs-deck-app ausente.');
    const manifest = readManifest();
    document.title = manifest.title || document.title || 'Apresentação TOTVS';
    await render(manifest);
    runtimeInit();
    nativeMotionInit();
    editorInit();
    accessibilityInit(manifest);
    document.documentElement.dataset.totvsReady = 'true';
    document.dispatchEvent(new CustomEvent('totvs:ready', { detail: { slides: manifest.slides.length } }));
  }

  function runtimeInit() {
        'use strict';
      const stage = document.querySelector('deck-stage');
      const viewport = document.getElementById('deck-viewport');
      if (!stage || !viewport) return;
      const slides = Array.from(stage.children).filter(el => el.tagName === 'SECTION');
      const previousButton = document.getElementById('deck-previous');
      const nextButton = document.getElementById('deck-next');
      const fullscreenButton = document.getElementById('deck-fullscreen');
      const counter = document.getElementById('deck-counter');
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const effects = new Set();
      const selector = '[data-animate="fade"], [data-animate="rise"]';
      const delays = [0, 90, 240, 380, 510, 620, 720, 810, 900];
      let currentSlide = 0;
      let renderedSlide = -1;

      function fitPresentation() {
        const scale = Math.min(viewport.clientWidth / 1280, viewport.clientHeight / 720) * 0.98;
        stage.style.transform = `scale(${Math.max(0, scale)})`;
      }

      function cancelEntrance() {
        effects.forEach(effect => effect.cancel());
        effects.clear();
      }

      function canRise(element, style) {
        if (!window.CSS?.supports('translate', '0 1px')) return false;
        if (style.transform !== 'none' || style.translate !== 'none') return false;
        const fixed = 'img, svg, [data-fixed], [data-pn]';
        if (element.matches(fixed) || element.querySelector(fixed)) return false;
        const descendants = [element, ...element.querySelectorAll('*')];
        if (descendants.some(node => getComputedStyle(node).backgroundImage !== 'none')) return false;
        if (descendants.some(node => node !== element &&
          ['absolute', 'fixed'].includes(getComputedStyle(node).position))) return false;
        const bounds = element.getBoundingClientRect();
        const shift = 13.32 * stage.getBoundingClientRect().height / 720;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const parentStyle = getComputedStyle(parent);
          if (/(hidden|clip|auto|scroll)/.test(parentStyle.overflowY)) {
            const box = parent.getBoundingClientRect();
            if (bounds.top < box.top || bounds.bottom + shift > box.bottom) return false;
          }
          if (parent === stage) break;
        }
        return true;
      }

      function animateSlide(slide) {
        if (stage.dataset.entrance !== 'cascade' || motion.matches) return;
        const groups = Array.from(slide.querySelectorAll(selector))
          .filter(element => !element.parentElement.closest(selector))
          .map((element, index) => {
            const requested = Number(element.dataset.animateOrder);
            const order = Number.isInteger(requested) && requested >= 0 ? requested : index;
            return { element, order };
          })
          .sort((a, b) => a.order - b.order);

        groups.forEach(({ element, order }) => {
          if (typeof element.animate !== 'function') return;
          const style = getComputedStyle(element);
          const opacity = Number.parseFloat(style.opacity);
          if (style.display === 'none' || style.visibility !== 'visible' || !(opacity > 0)) return;
          const rise = element.dataset.animate === 'rise' && canRise(element, style);
          const frames = [{ opacity: 0 }, { opacity }];
          if (rise) {
            frames[0].translate = '0 13.32px';
            frames[1].translate = '0 0';
          }
          let effect;
          try {
            effect = element.animate(frames, {
              duration: rise ? 700 : 420,
              delay: delays[Math.min(order, delays.length - 1)],
              easing: 'ease-out',
              fill: 'backwards'
            });
          } catch {
            return;
          }
          effects.add(effect);
          effect.finished.then(() => {
            effect.cancel();
            effects.delete(effect);
          }, () => effects.delete(effect));
        });
      }

      function updateSlides() {
        const changed = renderedSlide !== currentSlide;
        if (changed) cancelEntrance();
        slides.forEach((slide, index) => {
          const active = index === currentSlide;
          slide.classList.toggle('active', active);
          slide.setAttribute('aria-hidden', String(!active));
          slide.toggleAttribute('inert', !active);
          slide.setAttribute('role', 'group');
          slide.setAttribute('aria-roledescription', 'slide');
          slide.setAttribute('aria-label', `${index + 1} de ${slides.length}`);
          slide.querySelectorAll('[data-pn]').forEach(mark => {
            mark.textContent = String(index + 1).padStart(2, '0');
          });
        });
        counter.textContent = slides.length
          ? `${String(currentSlide + 1).padStart(2, '0')} / ${slides.length}` : '0 / 0';
        previousButton.disabled = currentSlide <= 0;
        nextButton.disabled = currentSlide >= slides.length - 1;
        if (changed) {
          renderedSlide = currentSlide;
          if (slides[currentSlide]) animateSlide(slides[currentSlide]);
        }
        document.dispatchEvent(new CustomEvent('totvs:slidechange', {
          detail: { currentSlide, totalSlides: slides.length }
        }));
      }

      function goToSlide(index) {
        if (!slides.length) return;
        const target = Math.max(0, Math.min(index, slides.length - 1));
        if (target === currentSlide) return;
        currentSlide = target;
        updateSlides();
      }

      async function toggleFullScreen() {
        try {
          if (!document.fullscreenElement) {
            if (typeof document.documentElement.requestFullscreen === 'function') {
              await document.documentElement.requestFullscreen();
            }
          } else if (typeof document.exitFullscreen === 'function') {
            await document.exitFullscreen();
          }
        } catch (error) {
          console.warn('Tela cheia indisponível neste ambiente.', error);
        }
      }

      function isInteractiveTarget(target) {
        return target instanceof Element && Boolean(target.isContentEditable ||
          target.closest('input, textarea, select, button, a, video, audio, [role="button"], [role="textbox"]'));
      }

      previousButton.addEventListener('click', () => goToSlide(currentSlide - 1));
      nextButton.addEventListener('click', () => goToSlide(currentSlide + 1));
      fullscreenButton.addEventListener('click', toggleFullScreen);
      fullscreenButton.hidden = typeof document.documentElement.requestFullscreen !== 'function';
      stage.addEventListener('dblclick', event => {
        if (!isInteractiveTarget(event.target)) toggleFullScreen();
      });
      document.addEventListener('keydown', event => {
        const key = event.key;
        const fromControlsToggle = event.target instanceof Element && Boolean(event.target.closest('#deck-controls-toggle'));
        const navigationFromToggle = fromControlsToggle &&
          ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Home', 'End', 'f', 'F'].includes(key);
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
          (isInteractiveTarget(event.target) && !navigationFromToggle)) return;
        if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(key)) {
          event.preventDefault(); goToSlide(currentSlide + 1);
        } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(key)) {
          event.preventDefault(); goToSlide(currentSlide - 1);
        } else if (key === 'Home') {
          event.preventDefault(); goToSlide(0);
        } else if (key === 'End') {
          event.preventDefault(); goToSlide(slides.length - 1);
        } else if (key.toLowerCase() === 'f') {
          event.preventDefault(); if (!event.repeat) toggleFullScreen();
        }
      });
      window.addEventListener('resize', fitPresentation);
      window.addEventListener('load', fitPresentation);
      document.addEventListener('fullscreenchange', fitPresentation);
      const onMotionChange = () => { if (motion.matches) cancelEntrance(); };
      if (typeof motion.addEventListener === 'function') motion.addEventListener('change', onMotionChange);
      else if (typeof motion.addListener === 'function') motion.addListener(onMotionChange);
      if (typeof ResizeObserver === 'function') new ResizeObserver(fitPresentation).observe(viewport);
      fitPresentation();
      updateSlides();
  }

  function nativeMotionInit() {
        'use strict';
      const stage = document.querySelector('deck-stage');
      const restartButton = document.getElementById('deck-motion-restart');
      const nextButton = document.getElementById('deck-motion-next');
      const toggleButton = document.getElementById('deck-motion-toggle');
      const status = document.getElementById('deck-motion-status');
      if (!stage || !restartButton || !nextButton || !toggleButton || !status) return;

      const payloads = new Map();
      document.querySelectorAll('script[data-slide-animation]').forEach(node => {
        try { payloads.set(node.dataset.slideAnimation, JSON.parse(node.textContent || '{}')); }
        catch (error) { console.warn('Payload de animação inválido.', node.dataset.slideAnimation, error); }
      });
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
      const animations = new Set();
      const timers = new Set();
      let enabled = !reducedMotion.matches;
      let state = null;
      let token = 0;

      const activeSlide = () => [...stage.children].find(node => node.tagName === 'SECTION' && node.classList.contains('active')) || null;
      const currentData = slide => payloads.get(slide?.dataset.templateId) || null;
      const targets = (slide, target) => {
        const shape = [...slide.querySelectorAll('[data-object]')].find(node => node.dataset.object === target?.shape_name);
        if (!shape) return [];
        if (!target.text_range) return [shape];
        const paragraphs = [...shape.querySelectorAll('.text-content>.text-paragraph,.text-content>.bullet-line')];
        if (!paragraphs.length) return [shape];
        const start = Math.max(0, parseInt(target.text_range.start_paragraph || '0', 10) || 0);
        const end = Math.max(start, parseInt(target.text_range.end_paragraph || String(start), 10) || start);
        return paragraphs.slice(start, end + 1);
      };
      const elements = (slide, effect) => [...new Set((effect.targets || []).flatMap(target => targets(slide, target)))];
      const cancel = () => { animations.forEach(animation => { try { animation.cancel(); } catch {} }); animations.clear(); timers.forEach(clearTimeout); timers.clear(); };
      const restore = local => local?.baselines.forEach((value, element) => {
        ['opacity','visibility','translate','scale','rotate'].forEach(key => value[key] ? element.style.setProperty(key, value[key]) : element.style.removeProperty(key));
      });
      const showFinalMedia = slide => slide?.querySelectorAll('img[data-final-poster-src]').forEach(image => image.src = image.dataset.finalPosterSrc);
      const revealAll = local => { cancel(); restore(local); showFinalMedia(local?.slide); };
      const durationFor = effect => effect.effect_name === 'appear' || effect.effect_name === 'disappear' ? 1 : Math.max(80, Number(effect.runtime_duration_ms ?? effect.duration_ms) || 700);
      const framesFor = (effect, element, slide) => {
        const opacity = Number.parseFloat(getComputedStyle(element).opacity) || 1;
        const width = slide.clientWidth || 1280, height = slide.clientHeight || 720;
        switch (effect.effect_name) {
          case 'fade_in': return [{opacity:0,visibility:'visible'},{opacity,visibility:'visible'}];
          case 'appear': return [{opacity:0,visibility:'hidden'},{opacity,visibility:'visible'}];
          case 'fade_out': case 'disappear': return [{opacity,visibility:'visible'},{opacity:0,visibility:'hidden'}];
          case 'zoom_in': return [{scale:'0',visibility:'visible'},{scale:'1',visibility:'visible'}];
          case 'spin': return [{rotate:'0deg'},{rotate:'-360deg'}];
          case 'fly_in_from_left': return [{translate:`${-width * 1.1}px 0`,visibility:'visible'},{translate:'0 0',visibility:'visible'}];
          case 'fly_in_from_right': return [{translate:`${width * 1.1}px 0`,visibility:'visible'},{translate:'0 0',visibility:'visible'}];
          case 'fly_in_from_top': return [{translate:`0 ${-height * 1.1}px`,visibility:'visible'},{translate:'0 0',visibility:'visible'}];
          case 'fly_in_from_bottom': return [{translate:`0 ${height * 1.1}px`,visibility:'visible'},{translate:'0 0',visibility:'visible'}];
          case 'fly_out_to_left': return [{translate:'0 0',visibility:'visible'},{translate:`${-width * 1.1}px 0`,visibility:'hidden'}];
          case 'fly_out_to_right': return [{translate:'0 0',visibility:'visible'},{translate:`${width * 1.1}px 0`,visibility:'hidden'}];
          default: return [{opacity,visibility:'visible'},{opacity,visibility:'visible'}];
        }
      };
      const schedule = group => {
        let previousStart = 0, previousEnd = 0;
        const speed = group.kind === 'manual' ? (Number(group.data.runtime_playback?.manual_step_speed_factor) || 1) : 1;
        return group.effects.map((effect, index) => {
          const trigger = effect.runtime_trigger || effect.trigger;
          const delay = Math.max(0, Number(effect.runtime_delay_ms ?? effect.delay_ms) || 0) * speed;
          const duration = durationFor(effect) * speed;
          const start = index ? (trigger === 'after_previous' ? previousEnd + delay : previousStart + delay) : delay;
          previousStart = start; previousEnd = start + duration;
          return {effect,start,duration};
        });
      };
      const playGroup = async (local, group, runToken) => {
        const running = schedule(group).flatMap(({effect,start,duration}) => elements(local.slide,effect).map(element => {
          const animation = element.animate(framesFor(effect,element,local.slide), {duration,delay:start,easing:effect.effect_name === 'spin' ? 'linear' : 'cubic-bezier(0,0,.2,1)',fill:'both'});
          animations.add(animation); animation.finished.finally(() => animations.delete(animation)); return animation;
        }));
        await Promise.allSettled(running.map(animation => animation.finished));
        return runToken === token;
      };
      const playMediaOnce = (slide, runToken) => slide.querySelectorAll('img[data-motion-src][data-poster-src]').forEach((image,index) => {
        image.src = image.dataset.posterSrc;
        const separator = image.dataset.motionSrc.includes('?') ? '&' : '?';
        image.src = `${image.dataset.motionSrc}${separator}play=${runToken}-${Date.now()}-${index}`;
        const duration = Math.max(0, Number(image.dataset.playDurationMs) || 0);
        if (duration && image.dataset.finalPosterSrc) {
          const timer = setTimeout(() => { timers.delete(timer); if (runToken === token && enabled) image.src = image.dataset.finalPosterSrc; }, duration);
          timers.add(timer);
        }
      });
      const buildState = (slide, data) => {
        const all = new Set(); (data.effects || []).forEach(effect => elements(slide,effect).forEach(element => all.add(element)));
        const baselines = new Map([...all].map(element => [element, {opacity:element.style.opacity,visibility:element.style.visibility,translate:element.style.translate,scale:element.style.scale,rotate:element.style.rotate}]));
        const automatic = {kind:'automatic',effects:[],data}, manual = []; let current = automatic;
        (data.effects || []).forEach(effect => { const trigger = effect.runtime_trigger || effect.trigger; if (trigger === 'on_click') { current = {kind:'manual',effects:[effect],data}; manual.push(current); } else current.effects.push(effect); });
        return {slide,data,baselines,automatic,manual,step:0,running:false};
      };
      const update = local => {
        const has = Boolean(local && ((local.data.effects || []).length || local.slide.querySelector('[data-motion-src]') || local.data.transition));
        restartButton.hidden = nextButton.hidden = toggleButton.hidden = !has || stage.dataset.entrance !== 'source';
        status.hidden = !has || stage.dataset.entrance !== 'source';
        restartButton.disabled = !has || !enabled;
        nextButton.disabled = !has || !enabled || local.running || local.step >= local.manual.length;
        toggleButton.textContent = enabled ? 'Desativar movimento' : 'Ativar movimento';
        toggleButton.setAttribute('aria-pressed', String(!enabled));
      };
      const restart = async () => {
        const slide = activeSlide(), data = currentData(slide), runToken = ++token;
        cancel(); if (state) restore(state);
        if (!slide || !data || stage.dataset.entrance !== 'source') { state = null; update(state); return; }
        state = buildState(slide,data); update(state);
        if (!enabled || reducedMotion.matches || stage.hasAttribute('data-editor-active')) { revealAll(state); status.textContent = 'Conteúdo completo exibido sem movimento.'; update(state); return; }
        const entrances = new Set(['fade_in','appear','fly_in_from_bottom','fly_in_from_left','fly_in_from_right','fly_in_from_top','zoom_in']);
        state.automatic.effects.concat(...state.manual.map(group => group.effects)).filter(effect => entrances.has(effect.effect_name)).forEach(effect => elements(slide,effect).forEach(element => { element.style.visibility='hidden'; if (effect.effect_name === 'fade_in' || effect.effect_name === 'appear') element.style.opacity='0'; }));
        playMediaOnce(slide,runToken);
        if (state.automatic.effects.length) { status.textContent='Reproduzindo animação automática.'; await playGroup(state,state.automatic,runToken); }
        if (runToken !== token || !state) return;
        status.textContent = state.manual.length ? `Pronto para a etapa 1 de ${state.manual.length}.` : 'Animação concluída.'; update(state);
      };
      const next = async () => {
        if (!state || !enabled || state.running || state.step >= state.manual.length) return;
        const runToken = token, number = state.step + 1, group = state.manual[state.step++]; state.running=true; update(state); status.textContent=`Reproduzindo etapa ${number} de ${state.manual.length}.`;
        await playGroup(state,group,runToken); if (runToken !== token || !state) return; state.running=false; status.textContent=state.step < state.manual.length ? `Etapa ${number} concluída. Próxima: ${state.step + 1}.` : 'Todas as etapas foram concluídas.'; update(state);
      };
      restartButton.addEventListener('click',restart); nextButton.addEventListener('click',next); toggleButton.addEventListener('click',()=>{ enabled=!enabled; restart(); });
      stage.addEventListener('click',event=>{ if (!state || event.target.closest('a,button,input,textarea,select,[contenteditable="true"]')) return; if (state.step < state.manual.length) next(); });
      document.addEventListener('totvs:slidechange',restart);
      new MutationObserver(()=>{ if (stage.dataset.entrance === 'source' && !stage.hasAttribute('data-editor-active')) restart(); else if (state) { revealAll(state); update(state); } }).observe(stage,{attributes:true,attributeFilter:['data-entrance','data-editor-active']});
      reducedMotion.addEventListener?.('change',event=>{ if (event.matches) enabled=false; restart(); });
      window.__TOTVS_SOURCE_MOTION__ = {restart,next,get state(){return state;}};
      restart();
  }

  function editorInit() {
        'use strict';
      const stage = document.querySelector('deck-stage');
      const button = document.getElementById('deck-edit');
      const downloadButton = document.getElementById('deck-download');
      const panel = document.getElementById('deck-editor-panel');
      const fields = document.getElementById('deck-editor-fields');
      const status = document.getElementById('deck-editor-status');
      const controlsPanel = document.getElementById('deck-controls-panel');
      const toggleButton = document.getElementById('deck-controls-toggle');
      if (!stage || !button || !downloadButton || !panel || !fields || !status || !controlsPanel || !toggleButton) return;

      const fieldSelector = '[data-editable="text"]';
      const protectedSelector = 'svg, img, [data-fixed], [data-pn], [data-slide-number], [data-editable="false"]';
      const entranceSelector = '[data-animate="fade"], [data-animate="rise"]';
      let editing = false;
      let changed = false;
      let originalEntrance = stage.getAttribute('data-entrance');
      let selected = null;
      let activeSlide = null;

      function setControlsExpanded(expanded) {
        const moveFocus = !expanded && controlsPanel.contains(document.activeElement);
        if (!expanded) finishEditing();
        controlsPanel.hidden = !expanded;
        toggleButton.setAttribute('aria-expanded', String(expanded));
        const label = expanded ? 'Ocultar controles' : 'Mostrar controles';
        toggleButton.setAttribute('aria-label', label);
        toggleButton.title = label;
        if (moveFocus) toggleButton.focus({ preventScroll: true });
        if (!expanded) document.dispatchEvent(new CustomEvent('totvs:controls-collapsed'));
      }

      function currentSlide() {
        return Array.from(stage.children).find(el => el.tagName === 'SECTION' && el.classList.contains('active')) || null;
      }

      function textNodes(element) {
        if (element.closest(protectedSelector)) return [];
        const nodes = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            return (node.data.trim() || node.data.includes('\u00a0')) && !node.parentElement.closest(protectedSelector)
              ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        });
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
      }

      function clearSelection() {
        if (selected) {
          selected.removeAttribute('data-editor-selected');
          selected.removeAttribute('data-editor-overflow');
        }
        selected = null;
        fields.replaceChildren();
        panel.hidden = true;
      }

      function hasTextOverflow(element) {
        const slide = element.closest('section');
        if (!slide) return false;
        if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) return true;
        const box = element.getBoundingClientRect();
        const slideBox = slide.getBoundingClientRect();
        if (box.left < slideBox.left - 1 || box.top < slideBox.top - 1 || box.right > slideBox.right + 1 || box.bottom > slideBox.bottom + 1) return true;
        for (let parent = element.parentElement; parent && parent !== slide; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (!/(hidden|clip|auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) continue;
          const parentBox = parent.getBoundingClientRect();
          if (box.left < parentBox.left - 1 || box.top < parentBox.top - 1 || box.right > parentBox.right + 1 || box.bottom > parentBox.bottom + 1) return true;
        }
        return false;
      }

      function reportFieldFit(element) {
        window.requestAnimationFrame(() => {
          if (!editing || element !== selected) return;
          const overflow = hasTextOverflow(element);
          element.toggleAttribute('data-editor-overflow', overflow);
          status.textContent = overflow
            ? 'Atenção: este texto ultrapassou a área segura. Reduza o conteúdo; a apresentação não diminui a fonte automaticamente.'
            : 'Alterações nesta aba. Confira o slide e baixe o HTML editado para conservar uma nova cópia.';
        });
      }

      function stopEntrance(slide) {
        if (!slide) return;
        slide.querySelectorAll(entranceSelector).forEach(element => {
          if (typeof element.getAnimations !== 'function') return;
          element.getAnimations().forEach(effect => {
            // The section's CSS transition is deliberately excluded.
            if (effect.effect?.target === element) effect.cancel();
          });
        });
      }

      function refreshSlide() {
        const next = currentSlide();
        if (next === activeSlide) return;
        activeSlide = next;
        clearSelection();
        if (editing) {
          stopEntrance(activeSlide);
          status.textContent = 'Clique em um texto marcado no slide para editar. Use Anterior e Próximo para mudar de slide.';
        }
      }

      function beginEditing() {
        editing = true;
        originalEntrance = stage.getAttribute('data-entrance');
        stage.setAttribute('data-entrance', 'none');
        stage.setAttribute('data-editor-active', '');
        activeSlide = currentSlide();
        stopEntrance(activeSlide);
        button.setAttribute('aria-pressed', 'true');
        button.textContent = '✓ Concluir edição';
        const available = activeSlide && Array.from(activeSlide.querySelectorAll(fieldSelector)).some(el => textNodes(el).length);
        status.textContent = available
          ? 'Clique em um texto marcado no slide para editar. Use Anterior e Próximo para mudar de slide.'
          : 'Este slide não tem campos de texto editáveis. Use Anterior ou Próximo para escolher outro slide.';
      }

      function finishEditing() {
        if (!editing) return;
        editing = false;
        clearSelection();
        stage.removeAttribute('data-editor-active');
        if (originalEntrance === null) stage.removeAttribute('data-entrance');
        else stage.setAttribute('data-entrance', originalEntrance);
        button.setAttribute('aria-pressed', 'false');
        button.textContent = '✏️ Editar slide';
        status.textContent = changed
          ? 'Alterações nesta aba. Clique em Baixar HTML editado para conservar uma nova cópia.'
          : 'Edição concluída. Nenhum texto foi alterado.';
        document.dispatchEvent(new CustomEvent('totvs:content-edited'));
      }

      function openField(element) {
        const nodes = textNodes(element);
        if (!nodes.length) return;
        clearSelection();
        selected = element;
        selected.setAttribute('data-editor-selected', '');
        nodes.forEach((node, index) => {
          const label = document.createElement('label');
          const title = document.createElement('span');
          title.textContent = nodes.length === 1 ? 'Texto' : `Trecho ${index + 1}`;
          const input = document.createElement('textarea');
          input.rows = 2;
          input.setAttribute('aria-describedby', 'deck-editor-help');
          const prefix = node.data.match(/^[\t\n\f\r ]*/)[0];
          const suffix = node.data.match(/[\t\n\f\r ]*$/)[0];
          input.value = node.data.trim();
          input.addEventListener('input', () => {
            const entered = input.value.replace(/\r\n?/g, '\n');
            // A nonbreaking space keeps an emptied text slot editable after export.
            const value = prefix + (entered.trim() ? entered : '\u00a0') + suffix;
            if (value === node.data) return;
            // Change only the existing text node: never parse user input as HTML.
            node.data = value;
            element.toggleAttribute('data-editor-linebreak',
              textNodes(element).some(textNode => textNode.data.trim().includes('\n')));
            changed = true;
            reportFieldFit(element);
            document.dispatchEvent(new CustomEvent('totvs:content-edited'));
          });
          label.append(title, input);
          fields.append(label);
        });
        panel.hidden = false;
        fields.querySelector('textarea')?.focus({ preventScroll: true });
      }

      function exportHTML() {
        finishEditing();
        const copy = document.documentElement.cloneNode(true);
        const copyStage = copy.querySelector('deck-stage');
        copyStage.removeAttribute('data-editor-active');
        copyStage.style.removeProperty('transform');
        if (!copyStage.getAttribute('style')?.trim()) copyStage.removeAttribute('style');
        copy.querySelectorAll('[data-editor-selected]').forEach(el => el.removeAttribute('data-editor-selected'));
        copy.querySelectorAll('[data-editor-overflow]').forEach(el => el.removeAttribute('data-editor-overflow'));
        const slides = Array.from(copyStage.children).filter(el => el.tagName === 'SECTION');
        slides.forEach((slide, index) => {
          const active = index === 0;
          slide.classList.toggle('active', active);
          slide.setAttribute('aria-hidden', String(!active));
          slide.toggleAttribute('inert', !active);
        });
        copy.querySelector('#deck-previous').disabled = true;
        copy.querySelector('#deck-next').disabled = slides.length < 2;
        copy.querySelector('#deck-counter').textContent = slides.length ? `01 / ${slides.length}` : '0 / 0';
        copy.querySelector('#deck-fullscreen').hidden = false;
        const copyEdit = copy.querySelector('#deck-edit');
        copyEdit.setAttribute('aria-pressed', 'false');
        copyEdit.textContent = '✏️ Editar slide';
        copy.querySelector('#deck-editor-panel').hidden = true;
        copy.querySelector('#deck-editor-fields').replaceChildren();
        copy.querySelector('#deck-editor-status').textContent = '';
        copy.querySelector('#deck-controls-panel').hidden = true;
        copy.querySelector('#deck-controls-toggle').setAttribute('aria-expanded', 'false');
        copy.querySelector('#deck-controls-toggle').setAttribute('aria-label', 'Mostrar controles');
        copy.querySelector('#deck-controls-toggle').setAttribute('title', 'Mostrar controles');
        return '<!DOCTYPE html>\n' + copy.outerHTML;
      }

      toggleButton.addEventListener('click', () => setControlsExpanded(controlsPanel.hidden));
      document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) setControlsExpanded(false);
      });
      button.addEventListener('click', () => editing ? finishEditing() : beginEditing());
      stage.addEventListener('click', event => {
        if (!editing || !(event.target instanceof Element)) return;
        const element = event.target.closest(fieldSelector);
        if (!element || element.closest('section') !== currentSlide()) return;
        event.preventDefault();
        openField(element);
      });
      stage.addEventListener('dblclick', event => {
        if (!editing) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      new MutationObserver(refreshSlide).observe(stage, { subtree: true, attributes: true, attributeFilter: ['class'] });

      downloadButton.addEventListener('click', () => {
        let url;
        let link;
        try {
          const html = exportHTML();
          const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
          url = URL.createObjectURL(blob);
          link = document.createElement('a');
          const name = (document.title || 'Apresentação TOTVS').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'apresentacao-totvs';
          link.href = url;
          link.download = `${name}-editada.html`;
          link.hidden = true;
          document.body.append(link);
          link.click();
          status.textContent = 'Download solicitado. Confira a nova cópia em Downloads. Se ela não aparecer, abra a apresentação em um navegador e tente novamente. O arquivo original não é sobrescrito.';
        } catch (error) {
          status.textContent = 'Não foi possível solicitar o download neste ambiente. Abra a apresentação em um navegador e tente novamente; as alterações continuam nesta aba.';
          console.warn('Download do HTML indisponível neste ambiente.', error);
        } finally {
          link?.remove();
          if (url) window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
      });
  }

  function accessibilityInit(manifest) {
    const stage = document.getElementById('deck-stage');
    const spacingButton = document.getElementById('deck-spacing-toggle');
    const contrastButton = document.getElementById('deck-contrast-toggle');
    const status = document.getElementById('deck-reading-status');
    if (!stage || !spacingButton || !contrastButton || !status) return;

    const requested = ['source', 'aa', 'high'].includes(manifest.contrast)
      ? manifest.contrast : 'aa';
    let regularContrast = requested === 'high' ? 'aa' : requested;

    const announce = message => { status.textContent = message; };
    const setContrast = mode => {
      stage.dataset.contrast = mode;
      document.documentElement.dataset.totvsContrast = mode;
      const high = mode === 'high';
      contrastButton.setAttribute('aria-pressed', String(high));
      contrastButton.textContent = high ? 'Contraste padrão' : 'Alto contraste';
    };

    setContrast(requested);
    const overflowCount = stage.querySelectorAll('[data-text-overflow]').length;
    if (requested === 'high') announce('Modo de alto contraste ativado.');
    else if (overflowCount) announce(`${overflowCount} caixa(s) de texto precisam de síntese ou ampliação adicional.`);

    spacingButton.addEventListener('click', () => {
      const active = stage.toggleAttribute('data-comfortable-spacing');
      spacingButton.setAttribute('aria-pressed', String(active));
      spacingButton.textContent = active ? 'Espaçamento padrão' : 'Mais espaçamento';
      announce(active ? 'Espaçamento de leitura ampliado.' : 'Espaçamento original restaurado.');
    });

    contrastButton.addEventListener('click', () => {
      const high = stage.dataset.contrast === 'high';
      if (!high) regularContrast = stage.dataset.contrast || regularContrast || 'aa';
      setContrast(high ? regularContrast : 'high');
      announce(high ? 'Contraste acessível padrão restaurado.' : 'Modo de alto contraste ativado.');
    });
  }

  start().catch(error => fail(error?.message || 'Erro inesperado no renderizador.', error));
})();

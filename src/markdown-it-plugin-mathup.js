import mathup from "mathup";

function scanDelims(state, start, delimLength) {
  const pos = start + delimLength;
  const count = pos - start;
  const max = state.posMax;
  const isWhiteSpace = state.md.utils.isWhiteSpace;

  // treat beginning of the line as a whitespace
  const lastChar = start > 0 ? state.src.codePointAt(start - 1) : 0x20;

  // treat end of the line as a whitespace
  const nextChar = pos < max ? state.src.codePointAt(pos) : 0x20;
  const canOpen = !isWhiteSpace(nextChar);
  const canClose = !isWhiteSpace(lastChar);

  return {
    canOpen,
    canClose,
    delims: count
  };
}


function mathInline(state, silent) {
  const max = state.posMax;
  const start = state.pos;
  const openDelim = state.src.slice(start, start + 2);

  if (openDelim !== "$$") { return false; }
  if (silent) { return false; }    // Don’t run any pairs in validation mode

  const { canOpen, delims: startCount } = scanDelims(state, start, openDelim.length);

  if (!canOpen) {
    state.pos += startCount;
    // Earlier we checked !silent, but this implementation does not need it
    state.pending += state.src.slice(start, state.pos);
    return true;
  }

  state.pos = start + 2;

  let found = false;
  while (state.pos < max) {
    const closeDelim = state.src.slice(state.pos, state.pos + 2);

    if (closeDelim === "$$") {
      const { canClose } = scanDelims(state, state.pos, 2);

      if (canClose) {
        found = true;
        break;
      }
    }

    state.md.inline.skipToken(state);
  }

  if (!found) {
    // Parser failed to find ending tag, so it is not a valid math
    state.pos = start;

    return false;
  }

  // Found!
  state.posMax = state.pos;
  state.pos = start + 2;

  // Earlier we checked !silent, but this implementation does not need it
  const token = state.push('math_inline', 'math', 0);
  token.content = state.src.slice(state.pos, state.posMax);
  token.markup = "$$";

  state.pos = state.posMax + 2;
  state.posMax = max;

  return true;
}

function mathBlock(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];

  if (pos + 3 > max) {
    return false;
  }

  const openDelim = state.src.slice(pos, pos + 3);

  if (openDelim !== "$$$") {
    return false;
  }

  pos += 3;


  // Since start is found, we can report success here in validation mode
  if (silent) {
    return true;
  }

  let firstLine = state.src.slice(pos, max);
  let haveEndMarker = false;

  if (firstLine.trim().slice(-3) === "$$$") {
    // Single line expression
    firstLine = firstLine.trim().slice(0, -3);
    haveEndMarker = true;
  }

  // search end of block
  let nextLine = startLine;
  let lastLine;

  while (true) {
    if (haveEndMarker) {
      break;
    }

    nextLine++;

    if (nextLine >= endLine) {
      // unclosed block should be autoclosed by end of document.
      // also block seems to be autoclosed by end of parent
      break;
    }

    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];

    if (pos < max && state.tShift[nextLine] < state.blkIndent) {
      // non-empty line with negative indent should stop the list:
      break;
    }

    if (state.src.slice(pos, max).trim().slice(-3) !== "$$$") {
      continue;
    }

    if (state.tShift[nextLine] - state.blkIndent >= 4) {
      // closing block math should be indented less then 4 spaces
      continue;
    }

    const lastLinePos = state.src.slice(0, max).lastIndexOf("$$$");
    lastLine = state.src.slice(pos, lastLinePos);

    pos += lastLine.length + 3;

    // make sure tail has spaces only
    pos = state.skipSpaces(pos);

    if (pos < max) {
      continue;
    }

    // found!
    haveEndMarker = true;
  }

  // If math block has heading spaces, they should be removed from its inner block
  const len = state.tShift[startLine];

  state.line = nextLine + (haveEndMarker ? 1 : 0);

  const token = state.push('math_block', 'math', 0);

  token.block = true;
  token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '') +
    state.getLines(startLine + 1, nextLine, len, true) +
    (lastLine && lastLine.trim() ? lastLine : '');
  token.map = [startLine, state.line];
  token.markup = "$$$";

  return true;
}

export default function mathupPlugin(md) {
  md.inline.ruler.before('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  });
  md.renderer.rules.math_inline = (tokens, idx) => mathup(tokens[idx].content).toString();
  md.renderer.rules.math_block = (tokens, idx) => `${mathup(tokens[idx].content, { display: 'block' }).toString()}\n`;
};

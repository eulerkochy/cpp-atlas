const CPP_TOKEN_REGEX =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|(^[ \t]*#[ \t]*[a-zA-Z_]+)|(\b(?:alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|co_await|co_return|co_yield|compl|concept|const|consteval|constexpr|constinit|const_cast|continue|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|override|final|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq)\b)|(\bstd::[A-Za-z_][A-Za-z0-9_]*|\b(?:size_t|ptrdiff_t|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t|uintptr_t|intptr_t|Widget|Buffer|Holder|Locked|Node|Wrapper|Guard|Packed|Self|Alloc|Allocator|T|U|R|S|X)\b)|(\b0[xX][0-9a-fA-F']+\b|\b0[bB][01']+\b|\b\d+(?:\.\d+)?[uUlLfF]*\b)/gm;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Single-pass C++ syntax highlighter producing span-wrapped HTML.
 * Never scans inside its own generated markup because alternation visits
 * each token left-to-right exactly once.
 */
export function highlightCppCode(rawCode: string): string {
  let out = "";
  let lastIndex = 0;

  CPP_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CPP_TOKEN_REGEX.exec(rawCode)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(rawCode.slice(lastIndex, match.index));
    }

    const tokenText = escapeHtml(match[0]);

    if (match[1]) {
      out += `<span class="tok-comment">${tokenText}</span>`;
    } else if (match[2]) {
      out += `<span class="tok-string">${tokenText}</span>`;
    } else if (match[3]) {
      out += `<span class="tok-preproc">${tokenText}</span>`;
    } else if (match[4]) {
      out += `<span class="tok-kw">${tokenText}</span>`;
    } else if (match[5]) {
      out += `<span class="tok-type">${tokenText}</span>`;
    } else if (match[6]) {
      out += `<span class="tok-num">${tokenText}</span>`;
    } else {
      out += tokenText;
    }

    lastIndex = CPP_TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < rawCode.length) {
    out += escapeHtml(rawCode.slice(lastIndex));
  }

  return out;
}

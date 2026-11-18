export interface GodboltOptions {
  lang?: "cpp" | "c";
  flags?: string;
}

const CPP26_PATTERN =
  /\bcontract_assert\b|\^\^|\[:|<meta>|<contracts>|std::execution|std::inplace_vector/;

function encodeBase64Ascii(ascii: string): string {
  if (typeof btoa === "function") {
    return btoa(ascii);
  }
  return Buffer.from(ascii, "utf8").toString("base64");
}

/**
 * Builds a Compiler Explorer (godbolt.org) `/clientstate/` URL preloaded with
 * the provided C or C++ snippet and appropriate standard flags.
 */
export function buildGodboltUrl(
  code: string,
  opts?: GodboltOptions
): string {
  const cleanCode = code.replace(/\u00a0/g, " ").replace(/\n+$/, "");
  const isC = opts?.lang === "c";

  const language = isC ? "c" : "c++";
  const compilerId = isC ? "cgsnapshot" : "gsnapshot";
  const defaultFlags = isC
    ? "-std=c23 -O2 -Wall -Wextra"
    : CPP26_PATTERN.test(cleanCode)
      ? "-std=c++2c -O2 -Wall -Wextra"
      : "-std=c++23 -O2 -Wall -Wextra";
  const flags = opts?.flags ?? defaultFlags;

  const payload = {
    sessions: [
      {
        id: 1,
        language,
        source: cleanCode,
        compilers: [{ id: compilerId, options: flags }],
      },
    ],
  };

  const escapedJson = JSON.stringify(payload).replace(
    /[\u007F-\uFFFF]/g,
    (c) => "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4)
  );
  const base64 = encodeBase64Ascii(escapedJson);

  return `https://godbolt.org/clientstate/${encodeURIComponent(base64)}`;
}

/**
 * Opens the given C or C++ snippet in Compiler Explorer in a new tab.
 */
export function openInGodbolt(code: string, opts?: GodboltOptions): void {
  if (typeof window === "undefined") return;
  window.open(buildGodboltUrl(code, opts), "_blank", "noopener,noreferrer");
}

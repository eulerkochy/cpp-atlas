import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-32 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm text-ink-soft sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div className="max-w-prose space-y-3 leading-relaxed">
          <p className="font-display text-lg font-[450] text-ink">C++ Atlas</p>
          <p>
            The study tracks are original notes, memory maps and quizzes. The{" "}
            <Link
              className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
              href="/w/cpp"
            >
              C++ reference
            </Link>{" "}
            and{" "}
            <Link
              className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
              href="/w/c"
            >
              C reference
            </Link>{" "}
            map every page of{" "}
            <a
              className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
              href="https://en.cppreference.com/w/cpp"
              target="_blank"
              rel="noopener noreferrer"
            >
              cppreference.com
            </a>{" "}
            1:1 under{" "}
            <a
              className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
              href="https://creativecommons.org/licenses/by-sa/3.0/"
              target="_blank"
              rel="license noopener noreferrer"
            >
              CC-BY-SA 3.0
            </a>{" "}
            and the GFDL, restyled for focused reading. Not affiliated with
            cppreference.
          </p>
          <p>
            Standard sections cite the{" "}
            <a
              className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
              href="https://eel.is/c++draft/"
              target="_blank"
              rel="noopener noreferrer"
            >
              C++ standard draft
            </a>
            .
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 self-start">
          <li>
            <Link className="hover:text-ink" href="/topics">
              Topics
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink" href="/maps">
              Maps
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink" href="/study">
              Study desk
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink" href="/standards">
              C++11–C++26 timeline
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink" href="/quiz">
              Mixed quiz
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink" href="/w/cpp">
              C++ reference
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink" href="/explore">
              Full directory
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink" href="/w/c">
              C reference
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink" href="/notebook">
              NotebookLM studio
            </Link>
          </li>
          <li>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, not a page */}
            <a className="hover:text-ink" href="/api/notebook/topics-all">
              Everything as markdown
            </a>
          </li>
          <li>
            <Link className="hover:text-ink" href="/w">
              Portal (/w)
            </Link>
          </li>
          <li>
            <a className="font-mono text-xs hover:text-ink" href="/llms.txt">
              llms.txt
            </a>
          </li>
          <li>
            <a className="font-mono text-xs hover:text-ink" href="/sitemap.xml">
              sitemap.xml
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}

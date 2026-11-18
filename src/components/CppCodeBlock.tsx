import { CopyCodeButton } from "@/components/CopyCodeButton";
import { Window } from "@/components/Window";
import { highlightCppCode } from "@/lib/cpp-highlight";
import { cn } from "@/lib/utils";

export function CppCodeBlock({
  code,
  caption,
  className,
  lang = "cpp",
  showGodbolt = true,
}: {
  code: string;
  caption?: string;
  className?: string;
  lang?: "cpp" | "c";
  showGodbolt?: boolean;
}) {
  const highlighted = highlightCppCode(code);

  return (
    <Window
      as="figure"
      size="code"
      title={caption ?? (lang === "c" ? "snippet.c" : "snippet.cpp")}
      actions={
        <CopyCodeButton
          code={code}
          lang={lang}
          showGodbolt={showGodbolt}
        />
      }
      className={cn("shadow-[0_14px_40px_-22px_rgb(120_80_0/0.25),0_1px_3px_rgb(0_0_0/0.04)]", className)}
    >
      <pre className="m-0 overflow-x-auto px-5 py-4 font-mono text-[0.84rem] leading-[1.7] text-[#262626]">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </Window>
  );
}

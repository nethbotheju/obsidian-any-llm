import { fileBlock, findRefs, parseObsidianFileUri, splitRefs } from "./src/refs";

let passed = 0;
let failed = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}\n  got: ${g}\n  want: ${w}`);
  }
}

const paths = (t: string) => findRefs(t).map((r) => r.path);

eq("bare at start", paths("@a.md"), ["a.md"]);
eq("after space", paths("hi @a/b.md"), ["a/b.md"]);
eq("two refs", paths("@a.md and @b.md"), ["a.md", "b.md"]);
eq("duplicates preserved", paths("@a.md @a.md"), ["a.md", "a.md"]);
eq("email does not trigger", paths("email@example.com"), []);
eq("midword does not trigger", paths("foo@bar"), []);
eq("paren is not whitespace", paths("(@notes.md)"), []);
eq("trailing period trimmed", paths("@notes.md."), ["notes.md"]);
eq("trailing paren trimmed", paths("@notes.md)"), ["notes.md"]);
eq("bare stops at space", paths("@a.md rest"), ["a.md"]);
eq("lone @ is no ref", paths("@"), []);
eq("bracketed with spaces", paths("@[My Notes/x.md]"), ["My Notes/x.md"]);
eq("bracketed in sentence", paths("open @[a b/c.md] now"), ["a b/c.md"]);

eq("split runs", splitRefs("hi @a.md!"), [
  { kind: "text", text: "hi " },
  { kind: "ref", path: "a.md" },
  { kind: "text", text: "!" },
]);

eq("fileBlock delimits", fileBlock("a.md", "body"), "\n\n[File: a.md]\nbody\n[End file]");

eq("obsidian uri decoded", parseObsidianFileUri("obsidian://open?vault=fyp&file=Learning%20Materials%2FQuantitative%20Finance%20Fundamentals%20-%20Option%20Pricing%20%26%20BSM%20Framework"), "Learning Materials/Quantitative Finance Fundamentals - Option Pricing & BSM Framework");
eq("non-obsidian uri ignored", parseObsidianFileUri("https://x.com/y"), null);
eq("uri without file param", parseObsidianFileUri("obsidian://open?vault=fyp"), null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

import {
  Box,
  Container,
  Editor,
  Key,
  Loader,
  Markdown,
  ProcessTerminal,
  Spacer,
  Text,
  TUI,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type EditorTheme,
  type MarkdownTheme,
} from "@earendil-works/pi-tui";
import chalk from "chalk";

import { conclave, single, type Message } from "./ai";
import { config } from "./config";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function fg(hex: string): (t: string) => string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (t) => `\x1b[38;2;${r};${g};${b}m${t}\x1b[39m`;
}

const C = {
  accent: fg("#8abeb7"),
  muted: fg("#808080"),
  dim: fg("#666666"),
  error: fg("#cc6666"),
  green: fg("#b5bd68"),
  heading: fg("#f0c674"),
  link: fg("#81a2be"),
  userBg: (t: string) => `\x1b[48;2;52;53;65m${t}\x1b[49m`,
};

const markdownTheme: MarkdownTheme = {
  heading: C.heading,
  bold: (t) => chalk.bold(t),
  italic: (t) => chalk.italic(t),
  listBullet: C.accent,
  quote: (t) => C.muted(chalk.italic(t)),
  quoteBorder: C.muted,
  link: (t) => C.link(chalk.underline(t)),
  linkUrl: C.dim,
  code: C.accent,
  codeBlock: C.green,
  codeBlockBorder: C.muted,
  hr: C.muted,
  strikethrough: (t) => chalk.strikethrough(t),
  underline: (t) => chalk.underline(t),
};

const editorTheme: EditorTheme = {
  borderColor: C.dim,
  selectList: {
    selectedPrefix: C.accent,
    selectedText: C.accent,
    description: C.muted,
    scrollInfo: C.muted,
    noMatch: C.muted,
  },
};

function formatModelName(modelId: string): string {
  const slash = modelId.indexOf("/");
  if (slash === -1) return modelId;
  const provider = modelId.slice(0, slash);
  const model = modelId.slice(slash + 1);
  return `${provider.charAt(0).toUpperCase()}${provider.slice(1)} - ${model}`;
}

class BorderedBox extends Container {
  constructor(private title: string) {
    super();
  }

  render(width: number): string[] {
    const inner = Math.max(1, width - 2);
    const childLines = super.render(inner);
    const maxTitle = Math.max(0, inner - 3);
    const title = maxTitle > 0 ? truncateToWidth(` ${this.title} `, maxTitle) : "";
    const titleVis = visibleWidth(title);
    const top = C.dim(
      titleVis > 0 ? `╭─${title}${"─".repeat(inner - 1 - titleVis)}╮` : `╭${"─".repeat(inner)}╮`,
    );
    const bottom = C.dim(`╰${"─".repeat(inner)}╯`);
    const middle = childLines.map(
      (line) =>
        C.dim("│") + line + " ".repeat(Math.max(0, inner - visibleWidth(line))) + C.dim("│"),
    );
    return ["", top, ...middle, bottom];
  }
}

class StatusLine extends Text {
  private intervalId: NodeJS.Timeout | null = null;
  private frame = 0;

  constructor(
    private ui: TUI,
    private label: string,
  ) {
    super("", 0, 0);
  }

  start(): void {
    this.tick();
    this.intervalId = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER.length;
      this.tick();
    }, 80);
  }

  finish(symbol: string, color: (s: string) => string = C.muted): void {
    this.stop();
    this.setText(`  ${color(this.label)} ${color(symbol)}`);
    this.ui.requestRender();
  }

  setIdle(): void {
    this.stop();
    this.setText(`  ${C.dim(this.label)}`);
    this.ui.requestRender();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    this.setText(`  ${C.muted(this.label)} ${C.accent(SPINNER[this.frame]!)}`);
    this.ui.requestRender();
  }
}

function main() {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  let conclaveMode = true;
  let modelIndex = 0;
  let processing = false;
  const history: Message[] = [];

  const editor = new Editor(tui, editorTheme);
  const statusBar = new Text("", 0, 0);

  const banner = new Text(
    [
      chalk.bold(C.accent("Conclave")),
      C.muted("tab cycle model · shift+tab switch mode · ctrl+c exit"),
    ].join("\n"),
    1,
    0,
  );

  function updateStatusBar() {
    if (conclaveMode) {
      statusBar.setText(`  ${C.accent("Conclave")}${C.dim(" (shift+tab to switch)")}`);
    } else {
      const model = config.models[modelIndex]!;
      statusBar.setText(
        `  ${C.accent("Single")}${C.muted(` · ${formatModelName(model)}`)}${C.dim(" (tab to cycle)")}`,
      );
    }
    tui.requestRender();
  }

  const chat = new Container();
  const status = new Container();

  tui.addChild(new Spacer(1));
  tui.addChild(banner);
  tui.addChild(new Spacer(1));
  tui.addChild(chat);
  tui.addChild(status);
  tui.addChild(new Spacer(1));
  tui.addChild(editor);
  tui.addChild(statusBar);
  updateStatusBar();
  tui.setFocus(editor);

  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      tui.stop();
      process.exit(0);
    }
    if (processing) return undefined;
    if (matchesKey(data, Key.shift("tab"))) {
      conclaveMode = !conclaveMode;
      updateStatusBar();
      return { consume: true };
    }
    if (matchesKey(data, Key.tab) && !conclaveMode) {
      modelIndex = (modelIndex + 1) % config.models.length;
      updateStatusBar();
      return { consume: true };
    }
    return undefined;
  });

  editor.onSubmit = (value: string) => void handleSubmit(value);

  async function handleSubmit(value: string) {
    if (processing) return;
    const question = value.trim();
    if (!question) return;

    editor.setText("");
    processing = true;
    editor.disableSubmit = true;
    history.push({ role: "user", content: question });

    const userBox = new Box(1, 1, C.userBg);
    userBox.addChild(new Markdown(question, 0, 0, markdownTheme));
    chat.addChild(userBox);
    tui.requestRender();

    try {
      const answer = conclaveMode
        ? await runConclave()
        : await runSingle(config.models[modelIndex]!);
      history.push({ role: "assistant", content: answer });
      chat.addChild(wrapBlock(new Markdown(answer, 1, 0, markdownTheme)));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      chat.addChild(wrapBlock(new Text(C.error(`error: ${msg}`), 1, 0)));
    } finally {
      processing = false;
      editor.disableSubmit = false;
      tui.requestRender();
    }
  }

  function wrapBlock(inner: Text | Markdown): Container {
    const c = new Container();
    c.addChild(new Spacer(1));
    c.addChild(inner);
    return c;
  }

  async function runSingle(modelId: string): Promise<string> {
    const loader = new Loader(tui, C.accent, C.muted, formatModelName(modelId));
    status.clear();
    status.addChild(loader);
    loader.start();
    try {
      return await single(modelId, history);
    } finally {
      loader.stop();
      status.clear();
      tui.requestRender();
    }
  }

  async function runConclave(): Promise<string> {
    const box = new BorderedBox("Conclave");
    const lines = new Map<string, StatusLine>();
    for (const modelId of config.models) {
      const line = new StatusLine(tui, formatModelName(modelId));
      lines.set(modelId, line);
      box.addChild(line);
      line.start();
    }
    const chairman = new StatusLine(tui, "Chairman");
    chairman.setIdle();
    box.addChild(chairman);
    status.clear();
    status.addChild(box);
    tui.requestRender();

    try {
      return await conclave(history, {
        onModelComplete: (id) => lines.get(id)?.finish("✓", C.green),
        onModelError: (id) => lines.get(id)?.finish("✗", C.error),
        onChairmanStart: () => chairman.start(),
        onChairmanComplete: () => chairman.finish("✓", C.green),
      });
    } finally {
      for (const line of lines.values()) line.stop();
      chairman.stop();
      status.clear();
      tui.requestRender();
    }
  }

  tui.start();
}

main();

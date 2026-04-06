import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  TextareaRenderable,
  MarkdownRenderable,
  ScrollBoxRenderable,
  SyntaxStyle,
  RGBA,
} from "@opentui/core";

import { conclave, single, type Message } from "./ai";
import { config } from "./config";

const COLORS = {
  text: "#e6edf3",
  dim: "#8b949e",
  dimmer: "#484f58",
  mode: "#c9d1d9",
};

const MSG_PADDING = { paddingLeft: 2, paddingRight: 3 };
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function formatModelName(modelId: string): string {
  const slash = modelId.indexOf("/");
  if (slash === -1) return modelId;
  const provider = modelId.slice(0, slash);
  const model = modelId.slice(slash + 1);
  return `${provider.charAt(0).toUpperCase()}${provider.slice(1)} - ${model}`;
}

const markdownStyle = SyntaxStyle.fromStyles({
  "markup.heading": { fg: RGBA.fromHex(COLORS.text), bold: true },
  "markup.bold": { fg: RGBA.fromHex(COLORS.text), bold: true },
  "markup.italic": { fg: RGBA.fromHex(COLORS.text), italic: true },
  "markup.list": { fg: RGBA.fromHex(COLORS.dim) },
  "markup.quote": { fg: RGBA.fromHex(COLORS.dim), italic: true },
  "markup.link": { fg: RGBA.fromHex(COLORS.dim), underline: true },
  "markup.raw": { fg: RGBA.fromHex(COLORS.text) },
  default: { fg: RGBA.fromHex(COLORS.text) },
});

let msgId = 0;
function nextId(prefix: string) {
  return `${prefix}-${++msgId}`;
}

async function main() {
  const activeIntervals = new Set<ReturnType<typeof setInterval>>();
  let liveRequested = false;

  function clearTrackedInterval(interval: ReturnType<typeof setInterval>) {
    clearInterval(interval);
    activeIntervals.delete(interval);
  }

  function cleanupLiveAndIntervals() {
    for (const interval of activeIntervals) {
      clearInterval(interval);
    }
    activeIntervals.clear();

    if (liveRequested && !renderer.isDestroyed) {
      renderer.dropLive();
    }
    liveRequested = false;
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
    useMouse: true,
    useKittyKeyboard: {},
    onDestroy: cleanupLiveAndIntervals,
  });

  renderer.on("selection", (selection) => {
    const text = selection.getSelectedText();
    if (text) renderer.copyToClipboardOSC52(text);
  });

  let modeIndex = 0;
  let singleModelIndex = 0;
  let processing = false;
  const history: Message[] = [];

  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    width: renderer.width,
    height: renderer.height,
    paddingY: 1,
  });

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "scroll",
    flexGrow: 1,
    stickyScroll: true,
    stickyStart: "bottom",
    contentOptions: { flexDirection: "column", gap: 1 },
  });

  scrollBox.content.minHeight = "100%" as never;
  scrollBox.verticalScrollBar.visible = false;
  scrollBox.horizontalScrollBar.visible = false;

  renderer.on("resize", (w: number, h: number) => {
    root.width = w;
    root.height = h;
  });

  const spacer = new BoxRenderable(renderer, { id: "spacer", flexGrow: 1 });

  const inputGroup = new BoxRenderable(renderer, {
    id: "input-group",
    flexDirection: "column",
    flexShrink: 0,
    paddingX: 1,
  });

  const inputBox = new BoxRenderable(renderer, {
    id: "input-box",
    border: true,
    borderStyle: "rounded",
    borderColor: COLORS.dimmer,
    flexShrink: 0,
    paddingX: 1,
  });

  const textarea = new TextareaRenderable(renderer, {
    id: "textarea",
    placeholder: "Ask a question",
    textColor: COLORS.text,
    minHeight: 1,
    maxHeight: 6,
    keyBindings: [
      { name: "return", action: "submit" },
      { name: "linefeed", action: "submit" },
    ],
    onSubmit: () => void handleSubmit(),
    onKeyDown: (key) => {
      if (key.name !== "tab") return;

      key.preventDefault();
      key.stopPropagation();

      if (key.shift) {
        modeIndex = modeIndex === 0 ? 1 : 0;
        updateStatusBar();
        return;
      }

      if (modeIndex === 1) {
        singleModelIndex = (singleModelIndex + 1) % config.models.length;
        updateStatusBar();
      }
    },
  });

  const statusBar = new BoxRenderable(renderer, {
    id: "status-bar",
    flexDirection: "row",
    paddingLeft: 2,
  });

  const modeName = new TextRenderable(renderer, { id: "mode-name", content: "", fg: COLORS.mode });
  const modeSwitch = new TextRenderable(renderer, {
    id: "mode-switch",
    content: "",
    fg: COLORS.dimmer,
  });
  const modelInfo = new TextRenderable(renderer, { id: "model-info", content: "", fg: COLORS.dim });
  const modelCycle = new TextRenderable(renderer, {
    id: "model-cycle",
    content: "",
    fg: COLORS.dimmer,
  });

  statusBar.add(modeName);
  statusBar.add(modeSwitch);
  statusBar.add(modelInfo);
  statusBar.add(modelCycle);
  updateStatusBar();

  inputBox.add(textarea);
  inputGroup.add(inputBox);
  inputGroup.add(statusBar);
  scrollBox.add(spacer);
  scrollBox.add(inputGroup);
  root.add(scrollBox);
  renderer.root.add(root);
  textarea.focus();

  function updateStatusBar() {
    modeSwitch.content = " (shift+tab to switch)";

    if (modeIndex === 0) {
      modeName.content = "Conclave";
      modelInfo.content = "";
      modelCycle.content = "";
    } else {
      modeName.content = "Single";
      modelInfo.content = ` · ${formatModelName(config.models[singleModelIndex]!)}`;
      modelCycle.content = " (tab to cycle)";
    }
  }

  function currentMode(): string {
    if (modeIndex === 0) return "conclave";
    return config.models[singleModelIndex]!;
  }

  function addMessage(renderable: BoxRenderable | TextRenderable | MarkdownRenderable) {
    scrollBox.insertBefore(renderable, spacer);
  }

  function animateSpinner(
    text: TextRenderable,
    label: string,
    prefix = "",
  ): ReturnType<typeof setInterval> {
    let frame = 0;
    const interval = setInterval(() => {
      frame = (frame + 1) % SPINNER.length;
      text.content = `${prefix}${label} ${SPINNER[frame]}`;
    }, 80);
    activeIntervals.add(interval);
    return interval;
  }

  async function handleSubmit() {
    if (processing) return;

    const question = textarea.plainText.trim();
    if (!question) return;

    textarea.setText("");

    processing = true;
    history.push({ role: "user", content: question });

    const userMsg = new BoxRenderable(renderer, { id: nextId("q"), ...MSG_PADDING });
    userMsg.add(
      new TextRenderable(renderer, {
        id: nextId("qt"),
        content: `> ${question}`,
        fg: COLORS.dim,
      }),
    );
    addMessage(userMsg);

    const responseBox = new BoxRenderable(renderer, {
      id: nextId("rb"),
      flexDirection: "column",
      ...MSG_PADDING,
    });

    const mode = currentMode();
    const thinkingLabel = mode === "conclave" ? "Thinking" : formatModelName(mode);
    const thinkingText = new TextRenderable(renderer, {
      id: nextId("think"),
      content: `${thinkingLabel} ${SPINNER[0]}`,
      fg: COLORS.dim,
    });

    responseBox.add(thinkingText);
    addMessage(responseBox);

    const spinnerAnim = animateSpinner(thinkingText, thinkingLabel);
    renderer.requestLive();
    liveRequested = true;

    try {
      let answer: string;

      if (mode === "conclave") {
        answer = await handleConclave(responseBox, thinkingText, spinnerAnim);
      } else {
        answer = await single(mode, history);
        clearTrackedInterval(spinnerAnim);
      }

      history.push({ role: "assistant", content: answer });
      responseBox.remove(thinkingText.id);
      responseBox.add(
        new MarkdownRenderable(renderer, {
          id: nextId("a"),
          content: answer,
          syntaxStyle: markdownStyle,
          conceal: true,
        }),
      );
    } catch (error) {
      clearTrackedInterval(spinnerAnim);
      responseBox.remove(thinkingText.id);
      responseBox.add(
        new TextRenderable(renderer, {
          id: nextId("err"),
          content: `error: ${error instanceof Error ? error.message : String(error)}`,
          fg: "#f85149",
        }),
      );
    } finally {
      cleanupLiveAndIntervals();
      processing = false;
      textarea.focus();
    }
  }

  async function handleConclave(
    responseBox: BoxRenderable,
    thinkingText: TextRenderable,
    dotsAnim: ReturnType<typeof setInterval>,
  ): Promise<string> {
    clearTrackedInterval(dotsAnim);
    responseBox.remove(thinkingText.id);

    const deliberationBox = new BoxRenderable(renderer, {
      id: nextId("delib"),
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.dimmer,
      title: "Conclave",
      titleAlignment: "left",
      flexDirection: "column",
    });

    const statusMap = new Map<string, TextRenderable>();
    const animMap = new Map<string, ReturnType<typeof setInterval>>();

    for (const modelId of config.models) {
      const label = formatModelName(modelId);
      const t = new TextRenderable(renderer, {
        id: nextId("ms"),
        content: `  ${label} ${SPINNER[0]}`,
        fg: COLORS.dim,
      });
      statusMap.set(modelId, t);
      animMap.set(modelId, animateSpinner(t, label, "  "));
      deliberationBox.add(t);
    }

    const chairmanLabel = "Chairman";
    const chairmanStatus = new TextRenderable(renderer, {
      id: nextId("cs"),
      content: `  ${chairmanLabel}`,
      fg: COLORS.dimmer,
    });
    deliberationBox.add(chairmanStatus);
    responseBox.add(deliberationBox);

    try {
      return await conclave(history, {
        onModelComplete: (modelId) => {
          const anim = animMap.get(modelId);
          if (anim) clearTrackedInterval(anim);
          const t = statusMap.get(modelId);
          if (t) {
            t.content = `  ${formatModelName(modelId)} ✓`;
            t.fg = COLORS.dim;
          }
        },
        onModelError: (modelId, _error) => {
          const anim = animMap.get(modelId);
          if (anim) clearTrackedInterval(anim);
          const t = statusMap.get(modelId);
          if (t) {
            t.content = `  ${formatModelName(modelId)} ✗`;
            t.fg = "#f85149";
          }
        },
        onChairmanStart: () => {
          chairmanStatus.fg = COLORS.dim;
          animMap.set("chairman", animateSpinner(chairmanStatus, chairmanLabel, "  "));
        },
        onChairmanComplete: () => {
          const anim = animMap.get("chairman");
          if (anim) clearTrackedInterval(anim);
          chairmanStatus.content = `  ${chairmanLabel} ✓`;
          chairmanStatus.fg = COLORS.dim;
        },
      });
    } finally {
      for (const anim of animMap.values()) {
        clearTrackedInterval(anim);
      }
    }
  }
}

main();

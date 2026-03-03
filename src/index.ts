import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  TextareaRenderable,
  MarkdownRenderable,
  ScrollBoxRenderable,
  SyntaxStyle,
  RGBA,
} from "@opentui/core"

import { conclave, single, type Message } from "./ai"
import { CONCLAVE_MODELS } from "./config"

const COLORS = {
  text: "#e6edf3",
  dim: "#8b949e",
  dimmer: "#484f58",
  mode: "#c9d1d9",
}

const MSG_PADDING = { paddingLeft: 2, paddingRight: 3 }

const markdownStyle = SyntaxStyle.fromStyles({
  "markup.heading": { fg: RGBA.fromHex(COLORS.text), bold: true },
  "markup.bold": { fg: RGBA.fromHex(COLORS.text), bold: true },
  "markup.italic": { fg: RGBA.fromHex(COLORS.text), italic: true },
  "markup.list": { fg: RGBA.fromHex(COLORS.dim) },
  "markup.quote": { fg: RGBA.fromHex(COLORS.dim), italic: true },
  "markup.link": { fg: RGBA.fromHex(COLORS.dim), underline: true },
  "markup.raw": { fg: RGBA.fromHex(COLORS.text) },
  default: { fg: RGBA.fromHex(COLORS.text) },
})

let msgId = 0
function nextId(prefix: string) {
  return `${prefix}-${++msgId}`
}

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
  })

  let modeIndex = 0
  let singleModelIndex = 0
  let processing = false
  const history: Message[] = []

  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    width: renderer.width,
    height: renderer.height,
    paddingY: 1,
  })

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "scroll",
    flexGrow: 1,
    stickyScroll: true,
    stickyStart: "bottom",
    contentOptions: { flexDirection: "column", gap: 1 },
  })

  scrollBox.content.minHeight = "100%" as never
  scrollBox.verticalScrollBar.visible = false
  scrollBox.horizontalScrollBar.visible = false

  renderer.on("resize", (w: number, h: number) => {
    root.width = w
    root.height = h
  })

  const spacer = new BoxRenderable(renderer, { id: "spacer", flexGrow: 1 })

  const inputGroup = new BoxRenderable(renderer, {
    id: "input-group",
    flexDirection: "column",
    flexShrink: 0,
    paddingX: 1,
  })

  const inputBox = new BoxRenderable(renderer, {
    id: "input-box",
    border: true,
    borderStyle: "rounded",
    borderColor: COLORS.dimmer,
    flexShrink: 0,
    paddingX: 1,
  })

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
      if (processing) return
      if (key.name === "tab" && !key.shift) {
        if (modeIndex === 1) {
          singleModelIndex = (singleModelIndex + 1) % CONCLAVE_MODELS.length
          updateStatusBar()
        }
      } else if (key.name === "tab" && key.shift) {
        modeIndex = modeIndex === 0 ? 1 : 0
        updateStatusBar()
      }
    },
  })

  const statusBar = new BoxRenderable(renderer, {
    id: "status-bar",
    flexDirection: "row",
    paddingLeft: 2,
  })

  const modeName = new TextRenderable(renderer, { id: "mode-name", content: "", fg: COLORS.mode })
  const modeSwitch = new TextRenderable(renderer, {
    id: "mode-switch",
    content: "",
    fg: COLORS.dimmer,
  })
  const modelInfo = new TextRenderable(renderer, { id: "model-info", content: "", fg: COLORS.dim })
  const modelCycle = new TextRenderable(renderer, {
    id: "model-cycle",
    content: "",
    fg: COLORS.dimmer,
  })

  statusBar.add(modeName)
  statusBar.add(modeSwitch)
  statusBar.add(modelInfo)
  statusBar.add(modelCycle)
  updateStatusBar()

  inputBox.add(textarea)
  inputGroup.add(inputBox)
  inputGroup.add(statusBar)
  scrollBox.add(spacer)
  scrollBox.add(inputGroup)
  root.add(scrollBox)
  renderer.root.add(root)
  textarea.focus()

  function updateStatusBar() {
    if (modeIndex === 0) {
      modeName.content = "Conclave"
      modeSwitch.content = " (shift+tab to switch)"
      modelInfo.content = ""
      modelCycle.content = ""
    } else {
      modeName.content = "Single"
      modeSwitch.content = " (shift+tab to switch)"
      modelInfo.content = ` · ${CONCLAVE_MODELS[singleModelIndex]!}`
      modelCycle.content = " (tab to cycle)"
    }
  }

  function currentMode(): string {
    if (modeIndex === 0) return "conclave"
    return CONCLAVE_MODELS[singleModelIndex]!
  }

  function addMessage(renderable: BoxRenderable | TextRenderable | MarkdownRenderable) {
    scrollBox.insertBefore(renderable, spacer)
  }

  function animateDots(text: TextRenderable): ReturnType<typeof setInterval> {
    let dots = 0
    return setInterval(() => {
      dots = (dots + 1) % 4
      text.content = "Thinking" + ".".repeat(dots || 1)
    }, 400)
  }

  async function handleSubmit() {
    const question = textarea.plainText.trim()
    textarea.setText("")
    if (!question || processing) return

    processing = true
    history.push({ role: "user", content: question })

    const userMsg = new BoxRenderable(renderer, { id: nextId("q"), ...MSG_PADDING })
    userMsg.add(
      new TextRenderable(renderer, {
        id: nextId("qt"),
        content: `> ${question}`,
        fg: COLORS.dim,
      }),
    )
    addMessage(userMsg)

    const responseBox = new BoxRenderable(renderer, {
      id: nextId("rb"),
      flexDirection: "column",
      ...MSG_PADDING,
    })

    const thinkingText = new TextRenderable(renderer, {
      id: nextId("think"),
      content: "Thinking.",
      fg: COLORS.dimmer,
    })

    responseBox.add(thinkingText)
    addMessage(responseBox)

    const dotsAnim = animateDots(thinkingText)
    renderer.requestLive()

    try {
      const mode = currentMode()
      let answer: string

      if (mode === "conclave") {
        answer = await handleConclave(responseBox, thinkingText, dotsAnim)
      } else {
        answer = await single(mode, history)
        clearInterval(dotsAnim)
      }

      history.push({ role: "assistant", content: answer })
      renderer.dropLive()
      responseBox.remove(thinkingText.id)
      responseBox.add(
        new MarkdownRenderable(renderer, {
          id: nextId("a"),
          content: answer,
          syntaxStyle: markdownStyle,
          conceal: true,
        }),
      )
    } catch (error) {
      clearInterval(dotsAnim)
      renderer.dropLive()
      responseBox.remove(thinkingText.id)
      responseBox.add(
        new TextRenderable(renderer, {
          id: nextId("err"),
          content: `error: ${error instanceof Error ? error.message : String(error)}`,
          fg: "#f85149",
        }),
      )
    }

    processing = false
    textarea.focus()
  }

  async function handleConclave(
    responseBox: BoxRenderable,
    thinkingText: TextRenderable,
    dotsAnim: ReturnType<typeof setInterval>,
  ): Promise<string> {
    clearInterval(dotsAnim)
    responseBox.remove(thinkingText.id)

    const deliberationBox = new BoxRenderable(renderer, {
      id: nextId("delib"),
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.dimmer,
      title: "Conclave",
      titleAlignment: "left",
      flexDirection: "column",
    })

    const statusMap = new Map<string, TextRenderable>()
    for (const modelId of CONCLAVE_MODELS) {
      const t = new TextRenderable(renderer, {
        id: nextId("ms"),
        content: `  ${modelId}`,
        fg: COLORS.dimmer,
      })
      statusMap.set(modelId, t)
      deliberationBox.add(t)
    }

    const chairmanStatus = new TextRenderable(renderer, {
      id: nextId("cs"),
      content: "  chairman",
      fg: COLORS.dimmer,
    })
    deliberationBox.add(chairmanStatus)
    responseBox.add(deliberationBox)

    return conclave(history, {
      onModelComplete: (modelId) => {
        const t = statusMap.get(modelId)
        if (t) {
          t.content = `  ${modelId} ✓`
          t.fg = COLORS.dim
        }
      },
      onChairmanStart: () => {
        chairmanStatus.content = "  chairman synthesizing"
      },
      onChairmanComplete: () => {
        chairmanStatus.content = "  chairman ✓"
        chairmanStatus.fg = COLORS.dim
      },
    })
  }
}

main()

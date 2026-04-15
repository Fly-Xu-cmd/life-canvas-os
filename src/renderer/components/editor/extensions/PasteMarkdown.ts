import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DOMParser } from '@tiptap/pm/model'

/**
 * 检测文本是否看起来像 Markdown
 */
function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) || // 标题
    /^\d+\.\s/m.test(text) || // 有序列表
    /^[-*+]\s/m.test(text) || // 无序列表
    /^>\s/m.test(text) || // 引用
    /^```[\s\S]*?```/m.test(text) || // 代码块
    /^`[^`]+`/m.test(text) || // 行内代码
    /^\s*[-*_]{3,}\s*$/m.test(text) // 水平线
  )
}

/**
 * PasteMarkdown 扩展
 * 拦截粘贴事件，自动将 Markdown 文本解析为富文本
 */
export const PasteMarkdown = Extension.create({
  name: 'pasteMarkdown',

  addProseMirrorPlugins() {
    const { editor } = this

    return [
      new Plugin({
        key: new PluginKey('pasteMarkdown'),
        props: {
          handlePaste: (_view, event) => {
            const text = event.clipboardData?.getData('text/plain')
            if (!text) return false

            // 判断这段文本是否看起来像 Markdown
            if (looksLikeMarkdown(text)) {
              event.preventDefault()

              // 使用 tiptap-markdown 的 parse 方法解析为 HTML
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const markdownStorage = (editor.storage as any).markdown
              const html = markdownStorage?.parser?.parse(text) as string

              // 创建临时 DOM 元素解析 HTML
              const element = document.createElement('div')
              element.innerHTML = html

              // 使用 ProseMirror 的 DOMParser 将 HTML 转为节点
              const { schema } = editor.state
              const parser = DOMParser.fromSchema(schema)
              const node = parser.parse(element)

              // 插入节点到光标位置
              editor.commands.insertContentAt(
                editor.state.selection.from,
                node.toJSON()
              )
              return true
            }

            return false
          },
        },
      }),
    ]
  },
})

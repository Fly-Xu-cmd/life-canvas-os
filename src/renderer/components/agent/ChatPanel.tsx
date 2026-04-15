/**
 * 聊天面板组件
 * 显示对话历史和输入框 - Apple 风格设计
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send,
  Loader2,
  Bot,
  Square,
  Plus,
  Clock,
  MoreHorizontal,
  Pin,
  Trash2,
  PinOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '~/renderer/lib/utils'
import { Button } from '~/renderer/components/ui/button'
import { ScrollArea } from '~/renderer/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/renderer/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/renderer/components/ui/dropdown-menu'
import { ChatMessage, type Message } from './ChatMessage'
import { ConfirmDialog } from './ConfirmDialog'
import {
  useAgentApi,
  AgentErrorType,
  type AgentError,
} from '~/renderer/hooks/useAgentApi'
import { useIsTruncated } from '~/renderer/hooks/useIsTruncated'
import type {
  AgentChatResponse,
  ConfirmationRequired,
  SessionListItem,
} from '~/renderer/api/agent'

type ViewMode = 'chat' | 'sessions'

interface SessionItemProps {
  session: SessionListItem
  isActive: boolean
  onSelect: (sessionId: string, title: string) => void
  onDelete: (sessionId: string) => void
  onPin: (sessionId: string, pinned: number) => void
  formatTime: (dateStr: string) => string
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onPin,
  formatTime,
}: SessionItemProps) {
  const titleRef = useRef<HTMLSpanElement>(null)
  const isTitleTruncated = useIsTruncated(titleRef)

  return (
    <Tooltip open={isTitleTruncated ? undefined : false}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'group relative flex items-center p-3 rounded-xl w-full',
            'transition-colors duration-200 cursor-pointer',
            isActive
              ? 'bg-white dark:bg-[#2c2c2e] border border-[#e8e8ed] dark:border-[rgba(255,255,255,0.1)]'
              : 'hover:bg-[#f0f0f2] dark:hover:bg-[#2c2c2e] border border-transparent'
          )}
          onClick={() =>
            onSelect(session.session_id, session.title || '新对话')
          }
        >
          {/* 固定图标 */}
          {session.pinned === 1 && (
            <Pin className="absolute left-1 top-1 h-3 w-3 text-[#007aff]" />
          )}

          {/* 标题和时间 */}
          <div className="flex-1 min-w-0">
            <span
              className="text-sm text-[#1d1d1f] dark:text-white truncate block"
              ref={titleRef}
            >
              {session.title || '新对话'}
            </span>
            <span className="text-xs text-[#c7c7cc] dark:text-[rgba(255,255,255,0.3)] mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(session.updated_at)}
            </span>
          </div>

          {/* 更多按钮 - 使用 CSS group-hover 控制显示 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <button
                className={cn(
                  'p-1 rounded hover:bg-[#e8e8ed] dark:hover:bg-[#3c3c3e] transition-colors',
                  'opacity-0 group-hover:opacity-100'
                )}
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4 text-[#98989f]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation()
                  onPin(session.session_id, session.pinned === 1 ? 0 : 1)
                }}
              >
                {session.pinned === 1 ? (
                  <>
                    <PinOff className="h-4 w-4 mr-2" />
                    取消固定
                  </>
                ) : (
                  <>
                    <Pin className="h-4 w-4 mr-2" />
                    固定会话
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation()
                  onDelete(session.session_id)
                }}
                variant="destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除会话
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs" side="right">
        <p>{session.title || '新对话'}</p>
      </TooltipContent>
    </Tooltip>
  )
}

interface ChatPanelProps {
  className?: string
}

export function ChatPanel({ className }: ChatPanelProps) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationRequired | null>(
    null
  )
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [currentSessionTitle, setCurrentSessionTitle] = useState('新对话')
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)

  const viewportRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLSpanElement>(null)

  const isTitleTruncated = useIsTruncated(titleRef)

  const {
    sendMessage,
    confirmAction,
    sessionId,
    clearSession,
    getHistory,
    getSessions,
    deleteSession,
    togglePinSession,
    abort,
    updateSessionId,
  } = useAgentApi()

  // 刷新会话列表
  const refreshSessions = useCallback(async () => {
    try {
      const response = await getSessions()
      setSessions(response.sessions || [])
    } catch (err) {
      console.error('Refresh sessions error:', err)
    }
  }, [getSessions])

  // 删除会话
  const handleDeleteSession = useCallback(
    async (targetSessionId: string) => {
      try {
        await deleteSession(targetSessionId)
        // 如果删除的是当前会话，清除
        if (targetSessionId === sessionId) {
          clearSession()
          setMessages([])
          setCurrentSessionTitle('新对话')
        }
        // 刷新列表
        refreshSessions()
        toast.success('会话已删除')
      } catch (error) {
        console.error('Delete session error:', error)
        toast.error('删除失败')
      }
    },
    [deleteSession, sessionId, clearSession, refreshSessions]
  )

  // 固定会话
  const handlePinSession = useCallback(
    async (targetSessionId: string, pinned: number) => {
      try {
        await togglePinSession(targetSessionId, pinned)
        refreshSessions()
        toast.success(pinned === 1 ? '已固定' : '已取消固定')
      } catch (error) {
        console.error('Pin session error:', error)
        toast.error('操作失败')
      }
    },
    [togglePinSession, refreshSessions]
  )

  // 导航到设置页面
  const navigateToSettings = useCallback(() => {
    navigate('/settings')
  }, [navigate])

  // 加载会话列表
  useEffect(() => {
    const loadSessions = async () => {
      setIsLoadingSessions(true)
      try {
        const response = await getSessions()
        setSessions(response.sessions || [])
      } catch (err) {
        console.error('Load sessions error:', err)
      } finally {
        setIsLoadingSessions(false)
      }
    }
    loadSessions()
  }, [getSessions])

  // 滚动到底部 - 使用 requestAnimationFrame 确保 DOM 已更新
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight
      }
    })
  }, [])

  // 处理选择会话
  const handleSelectSession = useCallback(
    async (targetSessionId: string, title?: string) => {
      // 如果切换回正在流式响应的当前 session，保留 streaming 状态并跳过历史加载
      const isReturningToStreamingSession =
        targetSessionId === sessionId && isStreaming

      if (!isReturningToStreamingSession) {
        // 清除 streaming 状态，避免思考动画显示在新 session 界面
        setIsStreaming(false)
        setStreamingContent('')
      }

      // 更新当前会话标题
      if (title) {
        setCurrentSessionTitle(title)
      }

      // 如果是切换回正在流式响应的 session，跳过历史加载以保留 in-progress 消息
      if (isReturningToStreamingSession) {
        setViewMode('chat')
        return
      }

      // 设置加载状态
      setIsLoadingHistory(true)

      // 加载历史消息
      try {
        const response = await getHistory(targetSessionId)
        // 后端直接返回 AgentSessionResponse，不需要 response.data 包装
        const historyMessages = response.messages || []

        const loadedMessages: Message[] = historyMessages.map(
          (msg: {
            id?: number
            role: string
            content: string
            created_at?: string
          }) => ({
            id: String(msg.id || Date.now()),
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: msg.created_at || new Date().toISOString(),
          })
        )

        setMessages(loadedMessages)
        setViewMode('chat')
        updateSessionId(targetSessionId)
        // 加载后滚动到底部
        setTimeout(scrollToBottom, 100)
      } catch (error) {
        console.error('Load history error:', error)
        toast.error('加载历史消息失败')
      } finally {
        setIsLoadingHistory(false)
      }
    },
    [getHistory, updateSessionId, scrollToBottom, isStreaming, sessionId]
  )

  // 处理新会话
  const handleNewChat = useCallback(() => {
    setIsStreaming(false)
    setStreamingContent('')
    setMessages([])
    setViewMode('chat')
    setCurrentSessionTitle('新对话')
    clearSession()
    // 重置滚动位置到顶部
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0
    }
  }, [clearSession])

  // 切换到会话列表
  const handleShowSessions = useCallback(() => {
    setViewMode('sessions')
  }, [])

  // 返回聊天界面
  const handleBackToChat = useCallback(() => {
    setViewMode('chat')
  }, [])

  // 恢复上次会话
  useEffect(() => {
    const restoreSession = async () => {
      // 等待会话列表加载完成
      if (isLoadingSessions || sessions.length === 0) return

      // 如果有保存的 sessionId，尝试恢复
      if (sessionId) {
        // 检查该会话是否还在列表中
        const sessionExists = sessions.some(s => s.session_id === sessionId)

        if (sessionExists) {
          // 找到会话标题
          const session = sessions.find(s => s.session_id === sessionId)
          if (session) {
            try {
              await handleSelectSession(sessionId, session.title || '新对话')
            } catch (error) {
              // 会话不存在或加载失败，清除无效的 sessionId
              console.error('Restore session error:', error)
              clearSession()
            }
          }
        } else {
          // 会话不在列表中，可能是被删除了，清除 sessionId
          clearSession()
        }
      }
    }

    restoreSession()
  }, [
    isLoadingSessions,
    sessions,
    sessionId,
    handleSelectSession,
    clearSession,
  ])

  // 消息更新后自动滚动
  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 50)
    return () => clearTimeout(timer)
  }, [messages, scrollToBottom])

  // 流式输出时持续滚动
  useEffect(() => {
    if (streamingContent) {
      const timer = setTimeout(scrollToBottom, 50)
      return () => clearTimeout(timer)
    }
  }, [streamingContent, scrollToBottom])

  // 聚焦输入框
  useEffect(() => {
    if (inputRef.current && viewMode === 'chat') {
      inputRef.current.focus()
    }
  }, [viewMode])

  // 处理发送消息
  const handleSend = useCallback(
    async (forcedMessage?: string) => {
      const messageText = forcedMessage || input
      const trimmedInput = messageText.trim()
      if (!trimmedInput || isStreaming) return

      // 如果是外部强制发送的消息，强制使用新会话（忽略已有 sessionId）
      const effectiveSessionId = forcedMessage ? '' : sessionId

      // 如果是新会话（没有 sessionId），使用用户的第一条消息作为标题
      if (!effectiveSessionId) {
        setCurrentSessionTitle(
          trimmedInput.slice(0, 15) + (trimmedInput.length > 15 ? '...' : '')
        )
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmedInput,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, userMessage])
      if (!forcedMessage) setInput('')
      setIsStreaming(true)
      setStreamingContent('')

      try {
        const response = await sendMessage(
          trimmedInput,
          effectiveSessionId,
          true
        )

        if (response instanceof ReadableStream) {
          const reader = response.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  if (data.session_id && !effectiveSessionId) {
                    updateSessionId(data.session_id)
                    // Refresh sessions list immediately to show new session
                    refreshSessions()
                  }
                  if (data.type === 'stream_chunk' && data.content) {
                    setStreamingContent(prev => prev + data.content)
                  } else if (data.type === 'error') {
                    toast.error('处理失败', {
                      description: data.message,
                    })
                    const errorMessage: Message = {
                      id: Date.now().toString(),
                      role: 'assistant',
                      content: data.message || '处理失败，请稍后重试',
                      timestamp: new Date().toISOString(),
                      error: true,
                    }
                    setMessages(prev => [...prev, errorMessage])
                  } else if (data.type === 'stream_end') {
                    console.log(
                      '[DEBUG] stream_end data:',
                      JSON.stringify(data, null, 2)
                    )
                    if (data.error) {
                      toast.error('处理失败', {
                        description: data.error,
                      })
                      const errorMessage: Message = {
                        id: data.session_id + Date.now().toString(),
                        role: 'assistant',
                        content: data.error,
                        timestamp: new Date().toISOString(),
                        error: true,
                      }
                      setMessages(prev => [...prev, errorMessage])
                    } else if (data.result) {
                      console.log(
                        '[DEBUG] stream_end result:',
                        JSON.stringify(data.result, null, 2)
                      )
                      console.log(
                        '[DEBUG] confirmation_required:',
                        data.result.confirmation_required
                      )
                      handleResponse(data.result as AgentChatResponse)
                      // 刷新会话列表
                      refreshSessions()
                    }
                    setIsStreaming(false)
                    setStreamingContent('')
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }
          }
        } else {
          handleResponse(response as AgentChatResponse)
          // 刷新会话列表
          refreshSessions()
        }
      } catch (error) {
        console.error('Send message error:', error)
        const agentError = error as AgentError

        if (agentError.type === AgentErrorType.AI_NOT_CONFIGURED) {
          toast.error('AI 服务未配置', {
            description: agentError.hint || '请先在设置中配置 AI 服务',
            action: {
              label: '去设置',
              onClick: navigateToSettings,
            },
          })
        } else if (agentError.type === AgentErrorType.NETWORK_ERROR) {
          toast.error('网络连接失败', {
            description: agentError.hint || '请检查网络连接',
          })
        } else {
          toast.error('处理失败', {
            description: agentError.message || '请稍后重试',
          })
        }

        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            agentError.hint ||
            agentError.message ||
            '抱歉，处理您的请求时出错了。请稍后重试。',
          timestamp: new Date().toISOString(),
          error: true,
        }
        setMessages(prev => [...prev, errorMessage])
      } finally {
        setIsStreaming(false)
        setStreamingContent('')
      }
    },
    [
      input,
      isStreaming,
      sendMessage,
      sessionId,
      navigateToSettings,
      updateSessionId,
      refreshSessions,
    ]
  )

  // 监听外部发送消息请求
  useEffect(() => {
    const handleForcedSend = (e: any) => {
      if (e.detail?.message) {
        // 给一点点延迟确保面板已完全渲染并就绪
        setTimeout(() => {
          handleSend(e.detail.message)
        }, 100)
      }
    }
    window.addEventListener('agent-send-message', handleForcedSend)
    return () =>
      window.removeEventListener('agent-send-message', handleForcedSend)
  }, [handleSend])

  // 监听创建新对话请求
  useEffect(() => {
    const handleNewChat = () => {
      // 清除当前会话，创建新对话
      setMessages([])
      setCurrentSessionTitle('新对话')
      clearSession()
    }
    window.addEventListener('agent-new-chat', handleNewChat)
    return () => window.removeEventListener('agent-new-chat', handleNewChat)
  }, [clearSession])

  // 处理响应
  const handleResponse = useCallback((response: AgentChatResponse) => {
    if (response.error) {
      toast.error('处理失败', {
        description: response.message || response.error,
      })

      const errorMessage: Message = {
        id: response.session_id + Date.now().toString(),
        role: 'assistant',
        content: response.message || '抱歉，处理您的请求时出错了。',
        timestamp: new Date().toISOString(),
        error: true,
      }
      setMessages(prev => [...prev, errorMessage])
      return
    }

    const errorPrefixes = ['抱歉，系统', '抱歉，', '错误：', '失败：']
    const hasErrorPrefix = errorPrefixes.some(prefix =>
      response.message?.startsWith(prefix)
    )
    if (hasErrorPrefix) {
      toast.error('处理失败', {
        description: response.message,
      })
      const errorMessage: Message = {
        id: response.session_id + Date.now().toString(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        error: true,
      }
      setMessages(prev => [...prev, errorMessage])
      return
    }

    if (response.confirmation_required) {
      console.log(
        '[DEBUG] Showing confirmation dialog:',
        response.confirmation_required
      )
      setConfirmation(response.confirmation_required)
    }

    if (response.message) {
      const assistantMessage: Message = {
        id: response.session_id + Date.now().toString(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        actions: response.actions,
      }
      setMessages(prev => [...prev, assistantMessage])
    }
  }, [])

  // 处理确认
  const handleConfirm = useCallback(
    async (confirmed: boolean, reason?: string) => {
      if (!confirmation) return

      try {
        const response = await confirmAction(
          sessionId,
          confirmation.confirmation_id,
          confirmed,
          reason
        )

        setConfirmation(null)

        if (response.message) {
          const assistantMessage: Message = {
            id: response.session_id + Date.now().toString(),
            role: 'assistant',
            content: response.message,
            timestamp: new Date().toISOString(),
            actions: response.actions,
          }
          setMessages(prev => [...prev, assistantMessage])
        }
      } catch (error) {
        console.error('Confirm action error:', error)
        const agentError = error as AgentError
        setConfirmation(null)

        if (agentError.type === AgentErrorType.AI_NOT_CONFIGURED) {
          toast.error('AI 服务未配置', {
            description: agentError.hint || '请先在设置中配置 AI 服务',
            action: {
              label: '去设置',
              onClick: navigateToSettings,
            },
          })
        } else if (agentError.type === AgentErrorType.NETWORK_ERROR) {
          toast.error('网络连接失败', {
            description: agentError.hint || '请检查网络连接',
          })
        } else {
          toast.error('确认失败', {
            description: agentError.message || '请稍后重试',
          })
        }

        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: agentError.hint || agentError.message || '确认操作失败',
          timestamp: new Date().toISOString(),
          error: true,
        }
        setMessages(prev => [...prev, errorMessage])
      }
    },
    [confirmation, confirmAction, sessionId, navigateToSettings]
  )

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  // 自动调整输入框高度
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value)
      // 自动调整高度
      const textarea = e.target
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`
    },
    []
  )

  // 格式化时间显示
  const formatTime = useCallback((dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const dayMs = 24 * 60 * 60 * 1000

      if (diff < 60 * 1000) return '刚刚'
      if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60 / 1000)}分钟前`
      if (diff < dayMs) return `${Math.floor(diff / 60 / 60 / 1000)}小时前`
      if (diff < 2 * dayMs) return '昨天'
      if (diff < 7 * dayMs) return `${Math.floor(diff / dayMs)}天前`
      return date.toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
      })
    } catch {
      return ''
    }
  }, [])

  return (
    <div
      className={cn(
        'fixed bottom-27.5 right-8 z-40',
        'w-212.5 max-w-[calc(100vw-64px)]',
        'h-150 max-h-[calc(100vh-140px)]',
        'rounded-2xl bg-white dark:bg-[#1c1c1e]',
        'border border-[#e8e8ed] dark:border-[rgba(255,255,255,0.1)]',
        'shadow-[0_10px_50px_rgba(0,0,0,0.15)]',
        'flex flex-row overflow-hidden',
        'animate-slide-up',
        className
      )}
    >
      {/* 左侧会话历史侧边栏 */}
      <aside
        className={cn(
          'w-[30%] flex flex-col',
          'bg-[#fafafc] dark:bg-[#141416]',
          'border-r border-[#e8e8ed] dark:border-[rgba(255,255,255,0.1)]'
        )}
      >
        {/* 侧边栏头部 */}
        <div
          className={cn(
            'flex items-center justify-between px-5 py-5',
            'border-b border-[#e8e8ed] dark:border-[rgba(255,255,255,0.1)]'
          )}
        >
          <span className="text-sm font-semibold text-[#007aff]">会话历史</span>
          <Button
            className="h-7 text-xs px-3 rounded-lg border border-[#007aff] text-[#007aff] bg-transparent hover:bg-[#007aff] hover:text-white"
            onClick={handleNewChat}
            variant="ghost"
          >
            <Plus className="h-3 w-3 mr-1" />
            新对话
          </Button>
        </div>

        {/* 会话列表 */}
        <ScrollArea className="flex-1 p-3">
          <div className="flex flex-col gap-1.5">
            {isLoadingSessions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 text-[#007aff] animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-[#98989f] text-sm text-center py-4">
                暂无会话记录
              </div>
            ) : (
              <TooltipProvider>
                {sessions.map(session => (
                  <SessionItem
                    formatTime={formatTime}
                    isActive={session.session_id === sessionId}
                    key={session.session_id}
                    onDelete={handleDeleteSession}
                    onPin={handlePinSession}
                    onSelect={handleSelectSession}
                    session={session}
                  />
                ))}
              </TooltipProvider>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* 右侧聊天主区域 */}
      <main className="w-[70%] flex flex-col bg-white dark:bg-[#1c1c1e]">
        {/* 聊天头部 */}
        <header
          className={cn(
            'flex items-center justify-between px-6 py-4',
            'border-b border-[#e8e8ed] dark:border-[rgba(255,255,255,0.1)]'
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#007aff] shrink-0">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <TooltipProvider>
              <Tooltip open={isTitleTruncated ? undefined : false}>
                <TooltipTrigger asChild>
                  <span
                    className="w-full font-medium text-[#1d1d1f] dark:text-white truncate cursor-default"
                    ref={titleRef}
                  >
                    {currentSessionTitle || '新对话'}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{currentSessionTitle || '新对话'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        {/* 消息区域 */}
        <ScrollArea
          className="flex-1 px-6 py-4 overflow-hidden"
          viewportRef={viewportRef}
        >
          <div className="flex flex-col gap-6 min-h-0">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-[#007aff] animate-spin" />
                <span className="ml-2 text-[#98989f] text-sm">
                  加载历史消息...
                </span>
              </div>
            ) : messages.length === 0 && !isStreaming ? (
              <div className="text-[#98989f] py-8 text-center text-sm">
                <p>你好！我是 Life Canvas OS 的 AI 助手。</p>
                <p className="mt-1">
                  你可以让我帮你写日记、查看评分或生成洞察建议。
                </p>
              </div>
            ) : (
              messages.map(message => (
                <ChatMessage key={message.id} message={message} />
              ))
            )}

            {/* 流式输出 */}
            {isStreaming && streamingContent && (
              <ChatMessage
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: streamingContent,
                  timestamp: new Date().toISOString(),
                }}
              />
            )}

            {/* 思考中 */}
            {isStreaming && !streamingContent && (
              <div className="flex gap-3 self-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6f6f7] dark:bg-[#2c2c2e]">
                  <Bot className="h-4 w-4 text-[#007aff]" />
                </div>
                <div className="bg-[#f6f6f7] dark:bg-[#2c2c2e] rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 bg-[#007aff] rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="w-2 h-2 bg-[#007aff] rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="w-2 h-2 bg-[#007aff] rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 输入区域 */}
        <div
          className={cn(
            'px-6 py-4 bg-white dark:bg-[#1c1c1e]',
            'border-t border-[#e8e8ed]/60 dark:border-[rgba(255,255,255,0.06)]'
          )}
        >
          <div className="flex gap-3 items-end">
            <textarea
              className={cn(
                'flex-1 resize-none rounded-xl px-4 py-3 text-sm',
                'bg-[#fcfcfd] dark:bg-[#2c2c2e]',
                'border border-[#e8e8ed] dark:border-[rgba(255,255,255,0.1)]',
                'text-[#1d1d1f] dark:text-white',
                'placeholder:text-[#c7c7cc] dark:placeholder:text-[rgba(255,255,255,0.3)]',
                'focus:outline-none focus:border-[#007aff] focus:ring-2 focus:ring-[#007aff]/20',
                'transition-all duration-200'
              )}
              disabled={isStreaming}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="输入你想问的内容..."
              ref={inputRef}
              rows={1}
              value={input}
            />
            {isStreaming ? (
              <Button
                className="h-12 px-5 rounded-xl bg-red-500 hover:bg-red-600 text-white"
                onClick={() => {
                  abort()
                  setIsStreaming(false)
                  setStreamingContent('')
                  if (streamingContent) {
                    const assistantMessage: Message = {
                      id: Date.now().toString(),
                      role: 'assistant',
                      content: streamingContent,
                      timestamp: new Date().toISOString(),
                    }
                    setMessages(prev => [...prev, assistantMessage])
                  }
                }}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                className="h-12 px-6 rounded-xl bg-[#007aff] hover:bg-[#0070e0] text-white font-medium"
                disabled={!input.trim()}
                onClick={() => handleSend()}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </main>

      {/* 确认对话框 */}
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          onCancel={reason => handleConfirm(false, reason)}
          onConfirm={() => handleConfirm(true)}
        />
      )}
    </div>
  )
}

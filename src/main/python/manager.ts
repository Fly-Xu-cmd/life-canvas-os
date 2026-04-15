/**
 * Python 进程管理器
 * 负责启动、停止和监控 Python 后端进程
 */
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { platform, homedir } from 'node:os'
import fs from 'node:fs'

import { app, BrowserWindow, dialog } from 'electron'

// 记录启动时的进程 PID，用于清理僵尸进程
let startedPid: number | null = null

// 流式事件类型
interface StreamEvent {
  type: 'stream_start' | 'stream_chunk' | 'stream_end'
  session_id: string
  content?: string
  result?: any
  error?: string
}

export class PythonManager {
  private process: ChildProcess | null = null
  private responseCallbacks = new Map<string, (response: any) => void>()
  private stdoutBuffer = Buffer.alloc(0) // 改用 Buffer
  public isReady = false
  // 重启限制相关
  private restartCount = 0
  private lastRestartTime = 0
  private isRestarting = false
  private readonly maxRestartCount = 5
  private readonly restartTimeWindow = 60000 // 60秒内最多重启5次
  // 后端就绪等待配置
  private readonly backendReadyTimeout = 30000 // 30秒（FastAPI 启动快，RAG 预热在后台执行）
  private readonly healthCheckInterval = 300 // 300ms 检查一次
  private readonly initialDelay = 1500 // 初始等待1.5秒

  // 配置文件路径（独立于应用数据目录）
  private getConfigPath(): string {
    return path.join(homedir(), '.lifecanvas', 'config.json')
  }

  // 读取数据目录配置
  private getConfiguredDataDir(): string | null {
    const configPath = this.getConfigPath()
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return config.data_dir || null
      } catch {
        return null
      }
    }
    return null
  }

  // 保存数据目录配置
  saveConfiguredDataDir(dataDir: string): void {
    const configDir = path.dirname(this.getConfigPath())
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      this.getConfigPath(),
      JSON.stringify({ data_dir: dataDir, version: 1 })
    )
  }

  // 获取当前配置的数据目录
  getDataDir(): string {
    return this.getConfiguredDataDir() || app.getPath('userData')
  }

  // 选择目录（首次启动或迁移时）
  async selectDataDirectory(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: '选择数据存储目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: homedir(),
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  }

  /**
   * 启动 Python 后端并等待就绪
   * @returns Promise<boolean> true=就绪, false=超时
   */
  async startAndWaitForReady(): Promise<boolean> {
    // 先启动进程
    this.start()

    // 等待初始启动时间（让进程完成fork/启动）
    await new Promise(resolve => setTimeout(resolve, this.initialDelay))

    // 轮询健康检查
    const startTime = Date.now()
    while (Date.now() - startTime < this.backendReadyTimeout) {
      if (await this.healthCheck()) {
        console.log('[Python Manager] Backend ready after startup')
        return true
      }
      // 等待一段时间再检查
      await new Promise(resolve =>
        setTimeout(resolve, this.healthCheckInterval)
      )
    }

    // 超时
    console.error('[Python Manager] Backend ready timeout')
    return false
  }

  /**
   * 启动 Python 后端进程
   */
  start() {
    const isDev = process.env.NODE_ENV === 'development'

    // 获取数据目录（配置 > 默认 userData）
    let dataDir = this.getConfiguredDataDir()
    if (!dataDir) {
      // 首次启动时使用默认值，后续可通过设置页面更改
      dataDir = app.getPath('userData')
    }

    let pythonPath: string
    let args: string[]

    if (isDev) {
      // 开发环境：使用虚拟环境中的 Python
      // __dirname 在开发模式下指向 node_modules/.dev/main
      // 需要回到项目根目录
      const projectRoot = path.resolve(__dirname, '../../..')
      // Windows: venv/Scripts/python.exe, Linux/macOS: venv/bin/python3
      const isWindows = process.platform === 'win32'
      const pythonBinDir = isWindows ? 'Scripts' : 'bin'
      const pythonExe = isWindows ? 'python.exe' : 'python3'
      const mainPyPath = path.join(projectRoot, 'backend', 'main.py')
      pythonPath = path.join(
        projectRoot,
        'backend',
        '.venv',
        pythonBinDir,
        pythonExe
      )
      args = [mainPyPath, '--dev', '--data-dir', dataDir]

      console.log('[Python Manager] Dev paths:', {
        projectRoot,
        pythonPath,
        mainPyPath,
        dataDir,
      })
    } else {
      // 生产环境：使用打包的 Python 可执行文件
      // electron-builder extraResources 配置:
      // from: 'backend/dist/backend' -> to: 'python-runtime/backend'
      const backendName =
        process.platform === 'win32' ? 'backend.exe' : 'backend'
      pythonPath = path.join(
        process.resourcesPath,
        'python-runtime',
        backendName
      )
      // 传递 --data-dir 参数指定数据存储目录
      args = ['--data-dir', dataDir]

      console.log('[Python Manager] Production mode, executable:', pythonPath)
    }

    console.log('[Python Manager] Starting Python:', {
      pythonPath,
      args,
      isDev,
      dataDir,
    })

    this.process = spawn(pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      // 不使用 detached 模式，确保子进程随父进程退出
      // detached: false 是默认值，但显式设置以明确意图
    })

    // 记录启动的 PID，用于后续清理
    if (this.process.pid) {
      startedPid = this.process.pid
      console.log(`[Python Manager] Process started with PID: ${startedPid}`)
    }

    // 监听 stdout（使用长度前缀协议）
    this.process.stdout?.on('data', data => {
      this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, data])
      this.processBuffer()
    })

    // 监听 stderr（日志输出）
    this.process.stderr?.on('data', data => {
      try {
        console.error('[Python stderr]', data.toString())
      } catch (error) {
        // 忽略所有管道错误，防止应用崩溃
        const err = error as any
        if (
          err?.code !== 'EPIPE' &&
          err?.code !== 'ERR_STREAM_PREMATURE_CLOSE'
        ) {
          console.error('[Python Manager] stderr error:', err)
        }
      }
    })

    // 进程退出处理
    this.process.on('exit', code => {
      console.error(`[Python Manager] Process exited with code ${code}`)
      this.isReady = false

      // 非正常退出时自动重启（带熔断机制）
      if (code !== 0 && code !== null) {
        const now = Date.now()

        // 如果距离上次重启超过时间窗口，重置计数
        if (now - this.lastRestartTime > this.restartTimeWindow) {
          this.restartCount = 0
        }

        // 检查是否超过重启限制
        if (this.restartCount >= this.maxRestartCount) {
          console.error(
            `[Python Manager] Restart limit reached (${this.maxRestartCount} times in ${this.restartTimeWindow / 1000}s). Stopping restart.`
          )
          return
        }

        this.restartCount++
        this.lastRestartTime = now
        console.log(
          `[Python Manager] Restarting in 2 seconds... (attempt ${this.restartCount}/${this.maxRestartCount})`
        )
        setTimeout(() => this.restart(), 2000)
      }
    })

    // 进程错误处理
    this.process.on('error', error => {
      console.error('[Python Manager] Process error:', error)
    })
  }

  /**
   * 处理 stdout 缓冲区（长度前缀协议）
   */
  private processBuffer() {
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf('\n')
      if (newlineIndex === -1) break

      const lengthStr = this.stdoutBuffer
        .subarray(0, newlineIndex)
        .toString('utf-8')
      const length = parseInt(lengthStr, 10)

      if (Number.isNaN(length)) {
        // 不是长度前缀格式，可能是日志，跳过
        console.warn('[Python Manager] Skipping non-length line:', lengthStr)
        this.stdoutBuffer = this.stdoutBuffer.subarray(newlineIndex + 1)
        continue
      }

      const jsonStart = newlineIndex + 1
      const jsonEnd = jsonStart + length

      if (this.stdoutBuffer.length < jsonEnd) break // 数据不完整

      const jsonBytes = this.stdoutBuffer.subarray(jsonStart, jsonEnd)
      const jsonStr = jsonBytes.toString('utf-8')
      this.stdoutBuffer = this.stdoutBuffer.subarray(jsonEnd)

      try {
        const response = JSON.parse(jsonStr)
        this.handleResponse(response)
      } catch (e) {
        console.error('[Python Manager] Failed to parse response:', e)
        console.error('[Python Manager] Length:', length)
        console.error('[Python Manager] JSON bytes length:', jsonBytes.length)
        console.error(
          '[Python Manager] JSON string (first 500 chars):',
          jsonStr.substring(0, 500)
        )
        console.error(
          '[Python Manager] JSON string (last 100 chars):',
          jsonStr.substring(Math.max(0, jsonStr.length - 100))
        )
      }
    }
  }

  /**
   * 处理 Python 响应
   */
  private handleResponse(response: any) {
    // 处理健康检查响应
    if (response.action === 'pong') {
      this.isReady = true
      console.log('[Python Manager] Backend is ready')
      return
    }

    // 处理流式事件
    if (response.type?.startsWith('stream_')) {
      this.handleStreamEvent(response as StreamEvent)
      return
    }

    // 处理业务响应
    const callback = this.responseCallbacks.get(response.id)
    if (callback) {
      callback(response)
      this.responseCallbacks.delete(response.id)
    }
  }

  /**
   * 处理流式事件
   */
  private handleStreamEvent(event: StreamEvent) {
    // 向所有窗口发送流式事件
    BrowserWindow.getAllWindows().forEach(win => {
      if (event.type === 'stream_start') {
        win.webContents.send('agent-stream-start', event)
      } else if (event.type === 'stream_chunk') {
        win.webContents.send('agent-stream-chunk', event)
      } else if (event.type === 'stream_end') {
        win.webContents.send('agent-stream-end', event)
      }
    })
  }

  /**
   * 发送请求到 Python 后端
   */
  async sendRequest(
    action: string,
    params: any = {},
    timeout = 30000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random()}`
      const request = { id, action, params }

      // 设置超时
      const timer = setTimeout(() => {
        this.responseCallbacks.delete(id)
        reject(new Error(`Request timeout: ${action}`))
      }, timeout)

      // 注册回调
      this.responseCallbacks.set(id, response => {
        clearTimeout(timer)
        if (response.success) {
          resolve(response.data)
        } else {
          reject(new Error(response.error || 'Unknown error'))
        }
      })

      // 发送请求（长度前缀格式）
      const jsonStr = JSON.stringify(request)
      const jsonBytes = Buffer.from(jsonStr, 'utf-8')
      const lengthPrefix = Buffer.from(`${jsonBytes.length}\n`, 'utf-8')
      const message = Buffer.concat([lengthPrefix, jsonBytes])

      const process = this.process
      if (process?.stdin?.writable) {
        try {
          process.stdin.write(message, err => {
            // 处理 EPIPE 错误（管道已关闭）
            if (err) {
              const errCode = (err as any).code
              if (
                errCode === 'EPIPE' ||
                errCode === 'ERR_STREAM_PREMATURE_CLOSE'
              ) {
                console.warn(
                  '[Python Manager] EPIPE: Python process may have exited'
                )
                clearTimeout(timer)
                this.responseCallbacks.delete(id)
                reject(new Error('Python process is not running'))
                return
              }
            }
          })
        } catch (err) {
          // 处理 stdin 已关闭的情况
          const errCode = (err as any).code
          if (errCode === 'EPIPE' || errCode === 'ERR_STREAM_PREMATURE_CLOSE') {
            clearTimeout(timer)
            this.responseCallbacks.delete(id)
            reject(new Error('Python process is not running'))
            return
          }
          throw err
        }
      } else {
        clearTimeout(timer)
        this.responseCallbacks.delete(id)
        reject(new Error('Python process is not running'))
      }
    })
  }

  /**
   * 停止 Python 进程（带超时和强制终止）
   * @param timeout 等待进程优雅退出的超时时间（毫秒），默认 5000ms
   */
  async stop(timeout = 5000): Promise<void> {
    const currentProcess = this.process
    const currentPid = this.process?.pid

    if (!currentProcess || !currentPid) {
      console.log('[Python Manager] No process to stop')
      this.process = null
      this.isReady = false
      return
    }

    // 清除全局记录
    startedPid = null

    let resolved = false

    return new Promise(resolve => {
      // 设置超时，超时后强制终止
      const forceKillTimer = setTimeout(() => {
        if (!resolved) {
          console.warn(
            '[Python Manager] Force killing process due to timeout...'
          )
          resolved = true
          this.forceKill(currentPid).then(() => {
            this.process = null
            this.isReady = false
            resolve()
          })
        }
      }, timeout)

      // 监听进程退出
      currentProcess.on('exit', (code, signal) => {
        if (!resolved) {
          resolved = true
          clearTimeout(forceKillTimer)
          this.process = null
          this.isReady = false
          console.log(
            `[Python Manager] Process stopped (code: ${code}, signal: ${signal})`
          )
          resolve()
        }
      })

      // 根据平台选择终止方式
      const isWindows = platform() === 'win32'

      if (isWindows) {
        // Windows: 直接使用 taskkill /F 强制终止整个进程树
        // SIGTERM 在 Windows 上会立即终止进程，没有优雅关闭的效果
        console.log(
          '[Python Manager] Windows: Using taskkill for termination...'
        )
        this.forceKill(currentPid)
      } else {
        // Unix: 先发送 SIGTERM 尝试优雅关闭
        console.log(
          '[Python Manager] Unix: Sending SIGTERM for graceful shutdown...'
        )
        const terminated = currentProcess.kill('SIGTERM')

        if (!terminated) {
          console.warn(
            '[Python Manager] Failed to send SIGTERM, process may already be dead'
          )
          resolved = true
          clearTimeout(forceKillTimer)
          this.process = null
          this.isReady = false
          resolve()
        }
      }
    })
  }

  /**
   * 强制终止进程（跨平台）
   * Windows 使用 taskkill 确保终止整个进程树
   */
  private forceKill(pid: number): Promise<void> {
    return new Promise(resolve => {
      const isWindows = platform() === 'win32'

      if (isWindows) {
        // Windows: 使用 taskkill /T /F 终止进程树（包括所有子进程）
        const proc = spawn('taskkill', ['/pid', pid.toString(), '/T', '/F'], {
          stdio: 'ignore',
        })

        proc.on('close', code => {
          console.log(`[Python Manager] taskkill exited with code ${code}`)
          resolve()
        })

        proc.on('error', err => {
          console.error('[Python Manager] taskkill error:', err)
          // Windows 不支持 Unix 信号，回退使用 taskkill /IM 终止所有 Python 进程
          const fallback = spawn('taskkill', ['/IM', 'python.exe', '/F'], {
            stdio: 'ignore',
          })
          fallback.on('close', () => resolve())
        })
      } else {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          // 进程可能已经退出
        }
        resolve()
      }
    })
  }

  /**
   * 重启 Python 进程
   */
  async restart() {
    // 防止并发重启
    if (this.isRestarting) {
      console.log('[Python Manager] Restart already in progress, skipping...')
      return
    }

    this.isRestarting = true
    try {
      // 检查是否已经有进程在运行
      if (this.process?.pid) {
        await this.stop()
        // 等待进程真正退出（最多5秒）
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      this.start()
    } finally {
      this.isRestarting = false
    }
  }

  /**
   * 健康检查 - 开发模式使用 HTTP，生产模式使用 IPC
   */
  async healthCheck(): Promise<boolean> {
    const isDev = process.env.NODE_ENV === 'development'

    if (isDev) {
      // 开发模式：使用 HTTP 健康检查（更可靠，跨进程）
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        const response = await fetch('http://localhost:8000/ping', {
          method: 'GET',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        return response.ok
      } catch (_e) {
        return false
      }
    } else {
      // 生产模式：使用 IPC ping/pong
      try {
        await this.sendRequest('ping', {}, 5000)
        return true
      } catch (_e) {
        return false
      }
    }
  }
}

// 单例
export const pythonManager = new PythonManager()

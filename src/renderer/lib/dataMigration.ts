/**
 * 数据迁移协调模块
 *
 * 职责：前端协调数据迁移流程
 *
 * 迁移流程：
 * 1. 用户点击"更改存储目录"，选择新目录
 * 2. 前端调用 Python API 执行迁移
 * 3. Python 复制数据到新目录、验证完整性
 * 4. Python 删除旧目录数据（释放空间）
 * 5. 前端更新 ~/.lifecanvas/config.json（通过 IPC）
 * 6. 前端重启 Python 进程（通过 IPC）
 * 7. 验证应用正常工作
 */

import { toast } from './toast'

// 获取全局暴露的 API
const api = (window as any).App

export interface MigrationResult {
  success: boolean
  old_data_dir: string
  new_data_dir: string
  message?: string
}

/**
 * 执行数据迁移
 *
 * @param newDataDir 新数据目录路径
 * @returns 迁移结果
 */
export async function migrateData(
  newDataDir: string
): Promise<MigrationResult> {
  // 获取旧数据目录
  const oldDataDir = await api.migrate.getDataDir()

  if (oldDataDir === newDataDir) {
    return {
      success: false,
      old_data_dir: oldDataDir,
      new_data_dir: newDataDir,
      message: '新旧目录相同，无需迁移',
    }
  }

  try {
    // 1. 调用迁移 API（通过 IPC -> pythonManager -> Python backend）
    toast.info('正在迁移数据，请稍候...')

    const result = await api.request('post_api_data_migrate', {
      new_data_dir: newDataDir,
    })

    if (!result || result.error) {
      throw new Error(result?.error || '迁移请求失败')
    }

    // 2. 更新配置文件（通过 IPC -> pythonManager）
    await api.migrate.saveConfig(newDataDir)

    // 3. 重启 Python 进程（通过 IPC）
    toast.info('正在重启服务...')
    const restartResult = await api.migrate.restartBackend()

    if (!restartResult || !restartResult.success) {
      throw new Error(restartResult?.error || '服务重启失败')
    }

    toast.success('数据迁移完成！')

    return {
      success: true,
      old_data_dir: oldDataDir,
      new_data_dir: newDataDir,
    }
  } catch (error) {
    console.error('[DataMigration] Migration failed:', error)
    toast.error(
      `迁移失败: ${error instanceof Error ? error.message : '未知错误'}`
    )

    return {
      success: false,
      old_data_dir: oldDataDir,
      new_data_dir: newDataDir,
      message: error instanceof Error ? error.message : '未知错误',
    }
  }
}

/**
 * 获取当前数据目录
 */
export async function getCurrentDataDir(): Promise<string> {
  return api.migrate.getDataDir()
}

/**
 * 选择数据目录（通过系统对话框）
 */
export async function selectDataDirectory(): Promise<string | null> {
  const result = await api.migrate.selectDirectory()
  if (result.canceled) {
    return null
  }
  return result.dirPath
}

/**
 * 验证目录是否可写
 */
export async function validateDirectory(_dirPath: string): Promise<boolean> {
  try {
    const result = await api.request('get_api_data_health', {})
    return result && result.status === 'healthy'
  } catch {
    return false
  }
}

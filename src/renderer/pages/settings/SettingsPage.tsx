import { useState, useEffect, useRef } from 'react'
import {
  Database,
  X,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Sun,
  Moon,
  Smartphone,
  ChevronRight,
  Shield,
  KeyRound,
  AlertTriangle,
  Loader2,
  Info,
  User,
  Brain,
  Palette,
  Settings,
  FileText,
  FolderOpen,
  HardDrive,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '~/renderer/contexts/AppContext'
import { GlassCard } from '~/renderer/components/GlassCard'
import { Input } from '~/renderer/components/ui/input'
import { Button } from '~/renderer/components/ui/button'
import { Switch } from '~/renderer/components/ui/switch'
import { Slider } from '~/renderer/components/ui/slider'
import { Badge } from '~/renderer/components/ui/badge'
import { TagInput } from '~/renderer/components/ui/tag-input'
import { Label } from '~/renderer/components/ui/label'
import { PinLockScreen } from '~/renderer/components/auth/PinLockScreen'
import { calculateLifeProgress } from '~/renderer/lib/lifeUtils'
import { useUserApi, type UserProfile } from '~/renderer/hooks/useUserApi'
import { useAiApi, type AIConfigData } from '~/renderer/hooks/useAiApi'
import { useDataApi, type ExportFormat } from '~/renderer/hooks/useDataApi'
import { usePinStatus } from '~/renderer/hooks/usePinStatus'
import { usePinApi } from '~/renderer/hooks'
import { useUserSettings } from '~/renderer/hooks/useUserSettings'
import { toast } from 'sonner'
import { ScrollArea } from '~/renderer/components/ui/scroll-area'
import { Separator } from '~/renderer/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/renderer/components/ui/select'
import { removeCache, CACHE_KEYS } from '~/renderer/lib/cacheUtils'
import { MBTI_TYPES } from '~/renderer/lib/constants'
import { migrateData, getCurrentDataDir } from '~/renderer/lib/dataMigration'

export function SettingsPage() {
  const [searchParams] = useSearchParams()
  const { state, updateState, setTheme } = useApp()
  const { getUserProfile, updateUserProfile } = useUserApi()
  const { getAIConfig, saveAIConfig } = useAiApi()
  const { exportData, importData, resetData } = useDataApi()
  const {
    pinStatus,
    isLoading: isPinStatusLoading,
    fetchPinStatus,
  } = usePinStatus()
  const { verifyPin } = usePinApi()
  const {
    settings: userSettings,
    fetchSettings,
    getPinVerifySwitch,
    updatePinVerifySwitch,
  } = useUserSettings()
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingAI, setIsSavingAI] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isMigrating, setIsMigrating] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [showResetConfirmDialog, setShowResetConfirmDialog] = useState(false)
  const [pinVerifyAction, setPinVerifyAction] = useState<
    'export' | 'reset' | null
  >(null)
  const [unlockError, setUnlockError] = useState<string | undefined>(undefined)
  const [aiConfigLoaded, setAiConfigLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get('tab') || 'profile'
  })
  const [isEditingAI, setIsEditingAI] = useState(false) // 是否处于编辑模式
  const [existingAIConfig, setExistingAIConfig] = useState<any>(null) // 已存在的 AI 配置
  const [currentDataDir, setCurrentDataDir] = useState<string>('') // 当前数据目录
  const isLoadingProfileRef = useRef(false)
  const getUserProfileRef = useRef(getUserProfile)

  // AI 配置本地状态
  const [aiFormData, setAiFormData] = useState<{
    provider: 'DeepSeek' | 'Doubao'
    apiKey: string
    modelName: string
    frequencyLimit: number
  }>({
    provider: 'DeepSeek',
    apiKey: '',
    modelName: 'deepseek-chat',
    frequencyLimit: 10,
  })

  // 更新 ref
  useEffect(() => {
    getUserProfileRef.current = getUserProfile
  }, [getUserProfile])

  // 表单本地状态
  const [formData, setFormData] = useState({
    name: '',
    birthday: '',
    mbti: '',
    values: [] as string[],
    lifespan: 0,
  })

  // 进入设置页面时加载用户信息
  useEffect(() => {
    const loadUserProfile = async () => {
      if (isLoadingProfileRef.current) return
      isLoadingProfileRef.current = true

      try {
        const profile = await getUserProfileRef.current()
        if (profile) {
          setFormData({
            name: profile.name || '',
            birthday: profile.birthday || '',
            mbti: profile.mbti || '',
            values: profile.values || [],
            lifespan: profile.lifespan || 0,
          })
        }
      } catch (_error) {
        console.log('User profile not set yet')
      } finally {
        isLoadingProfileRef.current = false
      }
    }

    loadUserProfile()
  }, [])

  const lifeProgress = calculateLifeProgress(
    formData.birthday,
    formData.lifespan
  )

  // 按 Tab 加载对应的接口
  useEffect(() => {
    const loadTabData = async () => {
      // AI 配置 - 只在首次切换到该 tab 时加载
      if (activeTab === 'ai' && !aiConfigLoaded) {
        try {
          const config = await getAIConfig()
          if (config) {
            // 保存完整的配置信息
            setExistingAIConfig(config)

            setAiFormData({
              provider: config.provider === 'deepseek' ? 'DeepSeek' : 'Doubao',
              apiKey: '', // 不显示完整的 API Key
              modelName: config.model_name || 'deepseek-chat',
              frequencyLimit: state.aiConfig.frequencyLimit || 10,
            })
            // 更新全局状态
            updateState({
              aiConfig: {
                ...state.aiConfig,
                provider:
                  config.provider === 'deepseek' ? 'DeepSeek' : 'Doubao',
                modelName: config.model_name || 'deepseek-chat',
                apiKey: state.aiConfig.apiKey, // 保留原有的 API Key
              },
            })
          } else {
            // 没有配置
            setExistingAIConfig(null)
          }
          setAiConfigLoaded(true)
        } catch (_error) {
          console.log('AI config not set yet')
          setExistingAIConfig(null)
          setAiConfigLoaded(true)
        }
      }

      // 数据管理 - 只在首次切换到该 tab 时加载 PIN 状态和用户设置
      if (activeTab === 'security') {
        try {
          await fetchPinStatus()
          await fetchSettings()
        } catch (error) {
          console.error('Failed to load PIN status or user settings:', error)
        }
      }

      // 数据管理 - 加载当前数据目录
      if (activeTab === 'data') {
        const dir = await getCurrentDataDir()
        setCurrentDataDir(dir)
      }
    }

    loadTabData()
  }, [activeTab, aiConfigLoaded])

  const handleSaveAIConfig = async () => {
    // 表单校验 - 检查 API Key 是否为空
    if (!aiFormData.apiKey || aiFormData.apiKey.trim() === '') {
      toast.error('请输入 API 密钥')
      return
    }

    setIsSavingAI(true)

    try {
      const configData: AIConfigData = {
        provider: aiFormData.provider,
        apiKey: aiFormData.apiKey,
        modelName: aiFormData.modelName,
      }

      const result = await saveAIConfig(configData)

      // 保存成功后，重新加载配置
      const updatedConfig = await getAIConfig()
      setExistingAIConfig(updatedConfig)

      // 更新全局状态
      updateState({
        aiConfig: {
          ...state.aiConfig,
          provider: aiFormData.provider,
          modelName: result.model_name,
          apiKey: configData.apiKey,
          frequencyLimit: aiFormData.frequencyLimit,
        },
      })

      // 清空 API Key 输入框（因为已保存）
      setAiFormData({
        ...aiFormData,
        apiKey: '',
      })

      // 退出编辑模式
      setIsEditingAI(false)
    } catch (error) {
      console.error('Failed to save AI config:', error)
    } finally {
      setIsSavingAI(false)
    }
  }

  // 进入编辑模式
  const handleEditAI = () => {
    setIsEditingAI(true)
  }

  // 取消编辑
  const handleCancelEditAI = () => {
    setIsEditingAI(false)
    setAiFormData({
      ...aiFormData,
      apiKey: '',
    })
  }

  const handleSaveProfile = async () => {
    // 表单校验
    if (!formData.name || formData.name.trim() === '') {
      toast.error('请输入显示名称')
      return
    }

    if (formData.name.length > 10) {
      toast.error('显示名称最多 10 个字')
      return
    }

    if (!formData.birthday || formData.birthday.trim() === '') {
      toast.error('请选择出生日期')
      return
    }

    if (!formData.mbti || formData.mbti.trim() === '') {
      toast.error('请选择 MBTI 类型')
      return
    }

    if (!formData.lifespan) {
      toast.error('请输入预期寿命')
      return
    }

    if (formData.lifespan < 50 || formData.lifespan > 120) {
      toast.error('预期寿命必须在 50-120 岁之间')
      return
    }

    setIsSaving(true)
    try {
      const profileData: UserProfile = {
        name: formData.name,
        birthday: formData.birthday,
        mbti: formData.mbti,
        values: formData.values,
        lifespan: formData.lifespan,
      }

      const result = await updateUserProfile(profileData)

      // 保存成功后，更新全局 state
      updateState({
        user: {
          name: result.name || '',
          birthday: result.birthday || '',
          mbti: result.mbti || '',
          values: result.values || [],
          lifespan: result.lifespan || 0,
        },
      })
    } catch (error) {
      console.error('Failed to save profile:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearData = async () => {
    // 检查 PIN 是否已设置以及是否需要验证
    try {
      const status = await fetchPinStatus()
      // 检查是否有 PIN 且设置了修改设置时需要验证
      const needVerify =
        status?.has_pin && getPinVerifySwitch('pin_verify_for_settings_change')

      if (needVerify) {
        // 需要验证 PIN
        setPinVerifyAction('reset')
        setShowPinDialog(true)
      } else {
        // 不需要验证 PIN，直接显示确认对话框
        setShowResetConfirmDialog(true)
      }
    } catch (error) {
      console.error('Failed to check PIN status:', error)
      // 如果检查失败，直接显示确认对话框
      setShowResetConfirmDialog(true)
    }
  }

  const handlePinVerifySuccess = async () => {
    setShowPinDialog(false)
    // 根据验证后的操作执行不同的逻辑
    if (pinVerifyAction === 'reset') {
      setShowResetConfirmDialog(true)
    } else if (pinVerifyAction === 'export') {
      setShowExportDialog(true)
    }
    setPinVerifyAction(null)
  }

  const handleConfirmReset = async () => {
    setShowResetConfirmDialog(false)
    setIsResetting(true)

    try {
      await resetData()

      // 清空本地所有数据（但保留首次启动标记）
      removeCache(CACHE_KEYS.LIFE_CANVAS_STATE)
      removeCache(CACHE_KEYS.JOURNAL_DRAFT)
      removeCache(CACHE_KEYS.PIN_STATUS)

      // 重置成功后刷新页面
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (error) {
      console.error('Reset failed:', error)
    } finally {
      setIsResetting(false)
    }
  }

  const handleExportClick = async () => {
    // 检查 PIN 是否已设置以及是否需要验证
    try {
      const status = await fetchPinStatus()
      // 检查是否有 PIN 且设置了导出数据时需要验证
      const needVerify =
        status?.has_pin && getPinVerifySwitch('pin_verify_for_data_export')

      if (needVerify) {
        // 需要验证 PIN
        setPinVerifyAction('export')
        setShowPinDialog(true)
      } else {
        // 不需要验证 PIN，直接显示导出对话框
        setShowExportDialog(true)
      }
    } catch (error) {
      console.error('Failed to check PIN status:', error)
      // 如果检查失败，直接显示导出对话框
      setShowExportDialog(true)
    }
  }

  const handleExportFormatSelect = async (format: ExportFormat) => {
    setIsExporting(true)
    setShowExportDialog(false)

    try {
      await exportData(format)
    } catch (error) {
      console.error('Export failed2:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportClick = async () => {
    setIsImporting(true)
    try {
      await importData()
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsImporting(false)
    }
  }

  // 处理存储位置变更
  const handleChangeStorageLocation = async () => {
    try {
      // 调用 Electron API 选择新目录
      const result = await window.App.fileOps.selectDirectory()
      if (result.canceled || !result.dirPath) {
        return
      }

      const newDir = result.dirPath
      if (newDir === currentDataDir) {
        toast.info('选择了相同的目录，无需迁移')
        return
      }

      // 确认操作
      const confirmed = window.confirm(
        `确定要将数据迁移到新目录吗？\n\n新目录: ${newDir}\n\n数据迁移可能需要一些时间，请耐心等待。`
      )
      if (!confirmed) {
        return
      }

      setIsMigrating(true)
      const migrationResult = await migrateData(newDir)

      if (migrationResult.success) {
        toast.success('数据迁移成功！')
        setCurrentDataDir(newDir)
      } else {
        toast.error(`迁移失败: ${migrationResult.message || '未知错误'}`)
      }
    } catch (error) {
      console.error('Change storage location failed:', error)
      toast.error('更改存储位置失败')
    } finally {
      setIsMigrating(false)
    }
  }

  // 左侧导航配置
  const navItems = [
    { id: 'profile', label: '个人档案', icon: User },
    { id: 'ai', label: 'AI 配置', icon: Brain },
    { id: 'appearance', label: '外观', icon: Palette },
    { id: 'security', label: '隐私与安全', icon: Shield },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-apple-textMain dark:text-white">
                个人资料
              </h2>
              <p className="text-sm text-apple-textSec dark:text-white/40">
                设置您的个人信息和偏好
              </p>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="display-name">显示名称</Label>
                  <Input
                    id="display-name"
                    onChange={e =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="您的姓名"
                    type="text"
                    value={formData.name}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthday">出生日期</Label>
                  <Input
                    id="birthday"
                    onChange={e =>
                      setFormData({ ...formData, birthday: e.target.value })
                    }
                    type="date"
                    value={formData.birthday}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mbti">MBTI 类型</Label>
                  <Select
                    onValueChange={value =>
                      setFormData({ ...formData, mbti: value })
                    }
                    value={formData.mbti}
                  >
                    <SelectTrigger className="w-full" id="mbti">
                      <SelectValue placeholder="请选择 MBTI 类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {MBTI_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label} - {type.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.mbti && (
                    <p className="text-xs text-apple-textTer dark:text-white/40">
                      已选择：{formData.mbti}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lifespan">预期寿命 (岁)</Label>
                  <Input
                    id="lifespan"
                    max={120}
                    min={50}
                    onChange={e => {
                      const value = parseInt(e.target.value, 10)
                      if (e.target.value === '') {
                        setFormData({ ...formData, lifespan: 0 })
                      } else if (Number.isNaN(value)) {
                        return
                      } else {
                        setFormData({ ...formData, lifespan: value })
                      }
                    }}
                    placeholder="请输入预期寿命（50-120 岁）"
                    step={1}
                    type="number"
                    value={formData.lifespan || ''}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>核心价值观</Label>
                <TagInput
                  onChange={values => setFormData({ ...formData, values })}
                  placeholder="按回车添加..."
                  value={formData.values}
                />
              </div>

              <div className="pt-4 border-t border-apple-border dark:border-white/5">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-apple-textSec dark:text-white/40">
                    实时生命进度
                  </span>
                  <span className="text-lg font-bold text-apple-textMain dark:text-white">
                    {lifeProgress.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-apple-bg2 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-apple-accent to-indigo-500 h-full transition-all duration-1000"
                    style={{ width: `${lifeProgress}%` }}
                  />
                </div>
              </div>

              <div className="pt-4">
                <Button
                  className="bg-apple-accent hover:bg-apple-accent/90"
                  disabled={isSaving}
                  onClick={handleSaveProfile}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={18} />
                      保存中...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2" size={18} />
                      保存更改
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )

      case 'ai':
        return (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-apple-textMain dark:text-white">
                AI 配置
              </h2>
              <p className="text-sm text-apple-textSec dark:text-white/40">
                配置 AI 服务和模型参数
              </p>
            </div>
            <Separator />
            {!existingAIConfig || isEditingAI ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>模型供应商</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['DeepSeek', 'Doubao'] as const).map(p => (
                      <Button
                        className={
                          aiFormData.provider === p
                            ? 'bg-apple-accent hover:bg-apple-accent/90'
                            : ''
                        }
                        key={p}
                        onClick={() =>
                          setAiFormData({ ...aiFormData, provider: p })
                        }
                        variant={
                          aiFormData.provider === p ? 'default' : 'outline'
                        }
                      >
                        {p}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="api-key">API 密钥</Label>
                  <Input
                    id="api-key"
                    onChange={e =>
                      setAiFormData({ ...aiFormData, apiKey: e.target.value })
                    }
                    placeholder="请输入您的 API Key"
                    type="password"
                    value={aiFormData.apiKey}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model-name">模型名称</Label>
                  <Select
                    defaultValue={aiFormData.modelName}
                    onValueChange={value =>
                      setAiFormData({
                        ...aiFormData,
                        modelName: value,
                      })
                    }
                    value={aiFormData.modelName}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deepseek-chat">
                        deepseek-chat
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label>日生成上限</Label>
                    <Badge
                      className="text-apple-accent bg-apple-accent/10"
                      variant="secondary"
                    >
                      {aiFormData.frequencyLimit} 次/日
                    </Badge>
                  </div>
                  <Slider
                    max={50}
                    min={1}
                    onValueChange={([value]) =>
                      setAiFormData({ ...aiFormData, frequencyLimit: value })
                    }
                    step={1}
                    value={[aiFormData.frequencyLimit]}
                  />
                  <div className="flex justify-between text-xs text-apple-textTer dark:text-white/30">
                    <span>极简</span>
                    <span>深度</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  {isEditingAI && (
                    <Button onClick={handleCancelEditAI} variant="outline">
                      取消
                    </Button>
                  )}
                  <Button
                    className="bg-apple-accent hover:bg-apple-accent/90"
                    disabled={isSavingAI}
                    onClick={handleSaveAIConfig}
                  >
                    {isSavingAI ? (
                      <>
                        <Loader2 className="mr-2 animate-spin" size={18} />
                        保存中...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2" size={18} />
                        保存配置
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-apple-accent/5 rounded-xl border border-apple-accent/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-apple-accent/10">
                      <KeyRound className="w-5 h-5 text-apple-accent" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-apple-textSec dark:text-white/60">
                        {existingAIConfig.provider === 'deepseek'
                          ? 'DeepSeek'
                          : 'Doubao'}{' '}
                        · {existingAIConfig.model_name}
                      </div>
                      <div className="text-sm font-mono text-apple-textMain dark:text-white">
                        sk-******************************************
                      </div>
                    </div>
                    <Button onClick={handleEditAI} variant="outline">
                      修改
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label>日生成上限</Label>
                    <Badge
                      className="text-apple-accent bg-apple-accent/10"
                      variant="secondary"
                    >
                      {aiFormData.frequencyLimit} 次/日
                    </Badge>
                  </div>
                  <Slider
                    max={50}
                    min={1}
                    onValueChange={([value]) =>
                      setAiFormData({ ...aiFormData, frequencyLimit: value })
                    }
                    step={1}
                    value={[aiFormData.frequencyLimit]}
                  />
                  <div className="flex justify-between text-xs text-apple-textTer dark:text-white/30">
                    <span>极简</span>
                    <span>深度</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )

      case 'appearance':
        return (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-apple-textMain dark:text-white">
                外观设置
              </h2>
              <p className="text-sm text-apple-textSec dark:text-white/40">
                自定义界面外观和主题
              </p>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>主题模式</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'light' as const, label: '浅色', icon: Sun },
                    { id: 'dark' as const, label: '深色', icon: Moon },
                    {
                      id: 'auto' as const,
                      label: '跟随系统',
                      icon: Smartphone,
                    },
                  ].map(t => (
                    <Button
                      className={`flex flex-col gap-2 h-24 ${state.theme === t.id ? 'bg-apple-accent hover:bg-apple-accent/90' : ''}`}
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      variant={state.theme === t.id ? 'default' : 'outline'}
                    >
                      <t.icon size={24} />
                      <span className="text-sm">{t.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between py-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-apple-textMain dark:text-white">
                    系统通知
                  </div>
                  <div className="text-xs text-apple-textSec dark:text-white/30">
                    在桌面端发送记录提醒
                  </div>
                </div>
                <Switch
                  checked={state.systemConfig.notificationsEnabled}
                  onCheckedChange={checked =>
                    updateState({
                      systemConfig: {
                        ...state.systemConfig,
                        notificationsEnabled: checked,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        )

      case 'security':
        return (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-apple-textMain dark:text-white">
                隐私与安全
              </h2>
              <p className="text-sm text-apple-textSec dark:text-white/40">
                管理数据安全和隐私设置
              </p>
            </div>
            <Separator />

            {pinStatus && !pinStatus.has_pin && (
              <div className="p-4 bg-gradient-to-r from-purple-500/5 to-indigo-500/5 rounded-xl border border-purple-500/20">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
                    <Shield size={20} />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div>
                      <div className="text-sm font-semibold text-apple-textMain dark:text-white">
                        设置 PIN 码保护
                      </div>
                      <div className="text-xs text-apple-textSec dark:text-white/50 mt-1">
                        设置 PIN 码后可将日记标记为私密，只有验证通过才能查看
                      </div>
                    </div>
                    <Link to="/settings/pin">
                      <Button className="bg-purple-500 hover:bg-purple-600">
                        立即设置
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {pinStatus?.has_pin && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-apple-textMain dark:text-white font-medium">
                    <KeyRound className="text-blue-500" size={16} />
                    PIN 验证开关
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between py-2">
                      <div className="text-sm">
                        <div className="font-medium text-apple-textMain dark:text-white">
                          启动时验证
                        </div>
                        <div className="text-xs text-apple-textSec dark:text-white/30">
                          应用启动时需要输入 PIN 码
                        </div>
                      </div>
                      <Switch
                        checked={getPinVerifySwitch('pin_verify_on_startup')}
                        onCheckedChange={checked =>
                          updatePinVerifySwitch(
                            'pin_verify_on_startup',
                            checked
                          )
                        }
                      />
                    </div>

                    <Separator className="my-2" />

                    <div className="flex items-center justify-between py-2">
                      <div className="text-sm">
                        <div className="font-medium text-apple-textMain dark:text-white">
                          查看私密日记
                        </div>
                        <div className="text-xs text-apple-textSec dark:text-white/30">
                          查看私密日记时需要验证
                        </div>
                      </div>
                      <Switch
                        checked={getPinVerifySwitch(
                          'pin_verify_for_private_journal'
                        )}
                        onCheckedChange={checked =>
                          updatePinVerifySwitch(
                            'pin_verify_for_private_journal',
                            checked
                          )
                        }
                      />
                    </div>

                    <Separator className="my-2" />

                    <div className="flex items-center justify-between py-2">
                      <div className="text-sm">
                        <div className="font-medium text-apple-textMain dark:text-white">
                          导出数据
                        </div>
                        <div className="text-xs text-apple-textSec dark:text-white/30">
                          导出备份数据时需要验证
                        </div>
                      </div>
                      <Switch
                        checked={getPinVerifySwitch(
                          'pin_verify_for_data_export'
                        )}
                        onCheckedChange={checked =>
                          updatePinVerifySwitch(
                            'pin_verify_for_data_export',
                            checked
                          )
                        }
                      />
                    </div>

                    <Separator className="my-2" />

                    <div className="flex items-center justify-between py-2">
                      <div className="text-sm">
                        <div className="font-medium text-apple-textMain dark:text-white">
                          修改设置
                        </div>
                        <div className="text-xs text-apple-textSec dark:text-white/30">
                          清除系统数据时需要验证
                        </div>
                      </div>
                      <Switch
                        checked={getPinVerifySwitch(
                          'pin_verify_for_settings_change'
                        )}
                        onCheckedChange={checked =>
                          updatePinVerifySwitch(
                            'pin_verify_for_settings_change',
                            checked
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-apple-textMain dark:text-white font-medium">
                    <Shield className="text-purple-500" size={16} />
                    PIN 码管理
                  </div>
                  <div className="space-y-2">
                    <Link className="block" to="/settings/pin/change">
                      <Button
                        className="w-full justify-between"
                        variant="outline"
                      >
                        <div className="flex items-center gap-3">
                          <KeyRound className="text-purple-500" size={16} />
                          <span>修改 PIN 码</span>
                        </div>
                        <ChevronRight size={16} />
                      </Button>
                    </Link>
                    <Button
                      className="w-full justify-between"
                      onClick={() =>
                        toast.info('该功能暂不开放', {
                          description: '删除 PIN 码功能将在后续版本中提供',
                        })
                      }
                      variant="outline"
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="text-destructive" size={16} />
                        <span>删除 PIN 码</span>
                      </div>
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-apple-textMain dark:text-white font-medium">
                <Database className="text-green-500" size={16} />
                数据管理
              </div>
              <div className="space-y-2">
                {/* 存储位置 */}
                <div className="p-3 bg-apple-bg2/50 dark:bg-white/5 rounded-xl border border-apple-border dark:border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <HardDrive className="text-blue-500" size={16} />
                    <span className="text-sm font-medium text-apple-textMain dark:text-white">
                      存储位置
                    </span>
                  </div>
                  <p className="text-xs text-apple-textSec dark:text-white/40 mb-3 break-all">
                    {currentDataDir || '加载中...'}
                  </p>
                  <Button
                    className="w-full justify-between"
                    disabled={isMigrating}
                    onClick={handleChangeStorageLocation}
                    size="sm"
                    variant="outline"
                  >
                    <div className="flex items-center gap-2">
                      <FolderOpen className="text-blue-500" size={14} />
                      <span>{isMigrating ? '迁移中...' : '更改存储位置'}</span>
                    </div>
                    <ChevronRight size={14} />
                  </Button>
                </div>

                <Button
                  className="w-full justify-between"
                  disabled={isExporting}
                  onClick={handleExportClick}
                  variant="outline"
                >
                  <div className="flex items-center gap-3">
                    <Download className="text-apple-accent" size={16} />
                    <span>导出备份数据</span>
                  </div>
                  <ChevronRight size={16} />
                </Button>

                <Button
                  className="w-full justify-between"
                  disabled={isImporting}
                  onClick={handleImportClick}
                  variant="outline"
                >
                  <div className="flex items-center gap-3">
                    <Upload className="text-green-500" size={16} />
                    <span>导入历史数据</span>
                  </div>
                  <ChevronRight size={16} />
                </Button>

                <Button
                  className="w-full justify-between hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleClearData}
                  variant="outline"
                >
                  <div className="flex items-center gap-3">
                    <Trash2 className="text-destructive" size={16} />
                    <span>清除系统数据</span>
                  </div>
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="h-screen flex">
      {/* 左侧导航栏 */}
      <div className="w-64 shrink-0 bg-apple-bg2/50 dark:bg-white/[0.02] border-r border-apple-border dark:border-white/5 p-4">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-apple-textMain dark:text-white flex items-center gap-2">
            <Settings className="text-apple-accent" size={24} />
            设置
          </h1>
        </div>
        <nav className="space-y-1">
          {navItems.map(item => (
            <button
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                activeTab === item.id
                  ? 'bg-apple-accent/10 text-apple-accent dark:bg-white/10 dark:text-white font-medium'
                  : 'text-apple-textSec dark:text-white/60 hover:text-apple-textMain dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {activeTab === item.id && (
                <ChevronRight className="ml-auto" size={16} />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* 右侧内容区 */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-8">{renderContent()}</div>

        {/* 页脚 */}
        <div className="max-w-2xl mx-auto px-8 pb-8">
          <Separator className="my-6" />
          <div className="flex flex-col items-center gap-2 pt-4">
            <div className="flex items-center gap-2 text-apple-textTer dark:text-white/10 text-[10px] font-black uppercase tracking-[0.4em]">
              Life Canvas OS • End-to-End Encryption
            </div>
            <div className="text-[9px] text-apple-textTer dark:text-white/5 font-medium uppercase tracking-[0.1em]">
              Copyright © 2025 Creative Canvas Labs. All Rights Reserved.
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* 导出格式选择弹窗 */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="!p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-apple-textMain dark:text-white mb-2">
              选择导出格式
            </h3>
            <p className="text-sm text-apple-textSec dark:text-white/50 mb-6">
              请选择您希望导出的数据格式
            </p>

            <div className="space-y-3">
              <Button
                className="w-full justify-between"
                onClick={() => handleExportFormatSelect('json')}
                variant="outline"
              >
                <div className="flex items-center gap-3 my-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Database size={20} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-semibold">JSON 格式</div>
                    <div className="text-xs text-apple-textSec dark:text-white/30 mt-0.5">
                      文本格式，易于阅读和编辑
                    </div>
                  </div>
                </div>
              </Button>

              <Button
                className="w-full justify-between"
                onClick={() => handleExportFormatSelect('zip')}
                variant="outline"
              >
                <div className="flex items-center gap-3 my-3">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                    <Download size={20} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-semibold">ZIP 格式</div>
                    <div className="text-xs text-apple-textSec dark:text-white/30 mt-0.5">
                      压缩格式，包含数据库文件和附件
                    </div>
                  </div>
                </div>
              </Button>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => setShowExportDialog(false)}
                variant="ghost"
              >
                取消
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* PIN 验证 */}
      {showPinDialog && (
        <PinLockScreen
          cancelButtonText="取消"
          description={
            pinVerifyAction === 'export'
              ? '请输入 PIN 码以确认导出数据操作'
              : '请输入 PIN 码以确认删除数据操作'
          }
          error={unlockError}
          onCancel={() => {
            setShowPinDialog(false)
            setPinVerifyAction(null)
            setUnlockError(undefined)
          }}
          onUnlock={async pin => {
            setUnlockError(undefined)
            const result = await verifyPin(pin)
            if (!result.success) {
              setUnlockError(result.error || 'PIN 验证失败')
              return
            }
            handlePinVerifySuccess()
          }}
          showCancelButton={true}
          title={pinVerifyAction === 'export' ? '导出数据验证' : '删除数据验证'}
          unlockButtonText="验证并继续"
          unlockingText="验证中..."
        />
      )}

      {/* 确认重置对话框 */}
      {showResetConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <GlassCard className="!p-8 max-w-md w-full space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="text-red-500" size={40} />
              </div>

              <div>
                <h3 className="text-2xl font-bold text-apple-textMain dark:text-white mb-2">
                  确认删除所有数据
                </h3>
                <p className="text-sm text-apple-textSec dark:text-white/60">
                  此操作将删除所有本地数据并重置系统
                </p>
              </div>

              <div className="w-full bg-red-500/5 dark:bg-red-500/5 border border-red-500/20 dark:border-red-500/10 rounded-xl p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="text-red-500 shrink-0 mt-0.5"
                    size={16}
                  />
                  <div className="text-left space-y-1">
                    <p className="text-xs font-semibold text-red-500 dark:text-red-400">
                      不可恢复的操作
                    </p>
                    <div className="text-xs text-apple-textSec dark:text-white/60 space-y-1">
                      <p>• 所有日记记录将被永久删除</p>
                      <p>• 八维系统评分数据将被清空</p>
                      <p>• 用户配置和个人信息将被重置</p>
                      <p>• AI 洞察历史将被清除</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 w-full">
                <Button
                  disabled={isResetting}
                  onClick={() => setShowResetConfirmDialog(false)}
                  variant="outline"
                >
                  取消
                </Button>
                <Button
                  className="flex-1 bg-red-500 hover:bg-red-600"
                  disabled={isResetting}
                  onClick={handleConfirmReset}
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      删除中...
                    </>
                  ) : (
                    '确认删除'
                  )}
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}

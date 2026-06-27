import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * 全局错误边界：
 * - 捕获子组件渲染阶段的未处理异常
 * - 显示 fallback UI 而非白屏
 * - 开发环境下打印完整错误信息便于排错
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error)
    console.error('[ErrorBoundary] 组件栈:', info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ink-12 flex items-center justify-center p-6">
          <div className="bg-ink-10 rounded-l p-8 max-w-sm w-full text-center">
            {/* 错误图标 */}
            <div className="w-14 h-14 rounded-full bg-ink-9 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <h2 className="text-white text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-gray-400 text-sm mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>

            {/* 错误详情（仅开发环境） */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-6 p-3 bg-ink-9 rounded-lg text-left max-h-32 overflow-auto">
                <p className="text-[#FF453A] text-xs font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <button
              onClick={this.handleRetry}
              className="w-full py-3 bg-primary text-black font-semibold rounded-l active:scale-95 transition-transform"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

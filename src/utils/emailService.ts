import emailjs from '@emailjs/browser'

// EmailJS 配置
// 注意：这些配置需要在 EmailJS 官网 (https://www.emailjs.com/) 注册并创建服务后获取
// 1. 注册账号
// 2. 创建 Email Service (Gmail/Outlook等)
// 3. 创建 Email Template
// 4. 获取 Public Key
const EMAILJS_CONFIG = {
  SERVICE_ID: import.meta.env.VITE_EMAILJS_SERVICE_ID || 'your_service_id',
  TEMPLATE_ID: import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'your_template_id',
  PUBLIC_KEY: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'your_public_key',
}

export interface SupportEmailData {
  name: string
  email: string
  message: string
  deviceName?: string
  appVersion?: string
}

/**
 * 发送支持反馈邮件
 * @param data 邮件数据
 * @returns Promise<{success: boolean, message: string}>
 */
export async function sendSupportEmail(data: SupportEmailData): Promise<{success: boolean, message: string}> {
  try {
    // 检查配置是否已设置
    if (EMAILJS_CONFIG.SERVICE_ID === 'your_service_id' ||
        EMAILJS_CONFIG.TEMPLATE_ID === 'your_template_id' ||
        EMAILJS_CONFIG.PUBLIC_KEY === 'your_public_key') {
      console.warn('[EmailService] EmailJS not configured, using demo mode')
      // 演示模式：模拟发送成功
      await new Promise(resolve => setTimeout(resolve, 1500))
      return {
        success: true,
        message: 'Feedback received! (Demo mode - EmailJS not configured)'
      }
    }

    const templateParams = {
      from_name: data.name,
      from_email: data.email,
      message: data.message,
      device_name: data.deviceName || 'Unknown Device',
      app_version: data.appVersion || 'Unknown Version',
      to_email: 'jason@sierro.us',
    }

    const response = await emailjs.send(
      EMAILJS_CONFIG.SERVICE_ID,
      EMAILJS_CONFIG.TEMPLATE_ID,
      templateParams,
      EMAILJS_CONFIG.PUBLIC_KEY
    )

    if (response.status === 200) {
      return {
        success: true,
        message: 'Feedback sent successfully! We will get back to you within 24 hours.'
      }
    } else {
      return {
        success: false,
        message: 'Failed to send feedback. Please try again later.'
      }
    }
  } catch (error) {
    console.error('[EmailService] Error sending email:', error)
    return {
      success: false,
      message: 'An error occurred while sending feedback. Please try again later.'
    }
  }
}

/**
 * 初始化 EmailJS
 * 在应用启动时调用
 */
export function initEmailService(): void {
  if (EMAILJS_CONFIG.PUBLIC_KEY && EMAILJS_CONFIG.PUBLIC_KEY !== 'your_public_key') {
    emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY)
    console.log('[EmailService] EmailJS initialized')
  } else {
    console.log('[EmailService] EmailJS not configured, running in demo mode')
  }
}
